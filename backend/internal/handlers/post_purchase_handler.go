// backend/internal/handlers/post_purchase_handler.go
package handlers

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PurchasePost handles POST /api/posts/:id/purchase
//
// Buyer spends `post.price` tokens from their wallet. Creator receives 75% in
// their wallet; the platform retains 25% implicitly (recorded via
// post_purchases.amount_tokens, settled later by TransferSplitProfit).
// One purchase per (post, user); creators can't buy their own posts.
func PurchasePost(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}
	postID := uint(postID64)

	var post models.Post
	if err := DB.First(&post, postID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
			return
		}
		log.Printf("❌ [PurchasePost] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if !post.IsPaid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This post is free"})
		return
	}
	if post.Price == nil || *post.Price <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Post has no valid price"})
		return
	}

	if post.UserID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Creators cannot purchase their own posts"})
		return
	}

	// Idempotency: refuse if the buyer already owns this post.
	var existing models.PostPurchase
	if err := DB.Where("post_id = ? AND user_id = ? AND status = ?", postID, userID, "completed").
		First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{
			"error":       "You already own this post",
			"purchase_id": existing.ID,
		})
		return
	}

	// Convert tokens (whole units) to cents (wallet storage unit).
	priceCents := int(*post.Price * 100)
	creatorShare := priceCents * 75 / 100
	platformShare := priceCents - creatorShare // remainder absorbs rounding so no value evaporates

	tx := DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Lock buyer wallet to prevent concurrent purchases from over-spending.
	var buyerWallet models.UserWallet
	if err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("user_id = ?", userID).First(&buyerWallet).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": "Wallet not found"})
		return
	}

	if buyerWallet.TokenBalance < priceCents {
		tx.Rollback()
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Insufficient token balance"})
		return
	}

	if err := buyerWallet.DeductTokens(priceCents); err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := tx.Save(&buyerWallet).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ [PurchasePost] Failed to save buyer wallet: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to deduct buyer tokens"})
		return
	}

	// Credit the creator's wallet (creating it if absent — first-time earner).
	var creatorWallet models.UserWallet
	if err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("user_id = ?", post.UserID).First(&creatorWallet).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			creatorWallet = models.UserWallet{
				UserID:         post.UserID,
				TokenBalance:   creatorShare,
				LifetimeEarned: creatorShare,
			}
			if err := tx.Create(&creatorWallet).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ [PurchasePost] Failed to create creator wallet: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to credit creator"})
				return
			}
		} else {
			tx.Rollback()
			log.Printf("❌ [PurchasePost] Failed to fetch creator wallet: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch creator wallet"})
			return
		}
	} else {
		creatorWallet.AddTokens(creatorShare)
		if err := tx.Save(&creatorWallet).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ [PurchasePost] Failed to save creator wallet: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to credit creator"})
			return
		}
	}

	txRef := fmt.Sprintf("post_purchase_%d_%d_%d", postID, userID, time.Now().UnixNano())

	spendTxn := models.TokenTransaction{
		UserID:          userID,
		TransactionType: models.TransactionTypePostPurchase,
		Amount:          priceCents,
		Status:          models.TransactionStatusCompleted,
		Metadata: map[string]interface{}{
			"post_id":         postID,
			"creator_id":      post.UserID,
			"transaction_ref": txRef,
			"platform_share":  platformShare,
			"description":     fmt.Sprintf("Purchased post #%d for %d token cents", postID, priceCents),
		},
	}
	if err := tx.Create(&spendTxn).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ [PurchasePost] Failed to log buyer transaction: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to log buyer transaction"})
		return
	}

	saleTxn := models.TokenTransaction{
		UserID:          post.UserID,
		TransactionType: models.TransactionTypePostSale,
		Amount:          creatorShare,
		Status:          models.TransactionStatusCompleted,
		Metadata: map[string]interface{}{
			"post_id":         postID,
			"buyer_id":        userID,
			"transaction_ref": txRef,
			"description":     fmt.Sprintf("Sale of post #%d (75%% share of %d token cents)", postID, priceCents),
		},
	}
	if err := tx.Create(&saleTxn).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ [PurchasePost] Failed to log creator transaction: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to log creator transaction"})
		return
	}

	purchase := models.PostPurchase{
		PostID:         postID,
		UserID:         userID,
		AmountTokens:   priceCents,
		PaymentMethod:  "tokens",
		TransactionRef: txRef,
		Status:         "completed",
	}
	if err := tx.Create(&purchase).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ [PurchasePost] Failed to record purchase: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record purchase"})
		return
	}

	if err := tx.Commit().Error; err != nil {
		log.Printf("❌ [PurchasePost] Commit failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete purchase"})
		return
	}

	log.Printf("✅ [PurchasePost] User %d purchased post %d for %d cents (creator %d +%d, platform +%d)",
		userID, postID, priceCents, post.UserID, creatorShare, platformShare)

	c.JSON(http.StatusOK, gin.H{
		"message":         "Purchase successful",
		"purchase_id":     purchase.ID,
		"amount_tokens":   priceCents,
		"transaction_ref": txRef,
		"buyer_balance":   buyerWallet.TokenBalance,
	})
}
