// backend/internal/handlers/support.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"gopkg.in/gomail.v2"
)

type SupportRequest struct {
	Subject   string `json:"subject" binding:"required"`
	Message   string `json:"message" binding:"required"`
	UserEmail string `json:"user_email"`
	Username  string `json:"username"`
}

// SendSupportEmail handles support/help requests from users
func SendSupportEmail(c *gin.Context) {
	var req SupportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
		return
	}

	// Get SMTP configuration from environment variables
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPort := 587 // Default Gmail SMTP port
	smtpUser := os.Getenv("SMTP_USER")
	smtpPassword := os.Getenv("SMTP_PASSWORD")

	if smtpHost == "" || smtpUser == "" || smtpPassword == "" {
		log.Println("⚠️ SMTP configuration missing - email not sent")
		// Return success to user but log the issue
		c.JSON(http.StatusOK, gin.H{
			"message": "Support request received (email configuration pending)",
		})
		return
	}

	// Compose email
	m := gomail.NewMessage()
	m.SetHeader("From", smtpUser)
	m.SetHeader("To", "watchoutrev@gmail.com")
	m.SetHeader("Subject", fmt.Sprintf("[WeWatch Support] %s", req.Subject))

	// Email body with user information
	body := fmt.Sprintf(`
New Support Request from WeWatch

From: %s (%s)
Subject: %s

Message:
%s

---
This is an automated message from WeWatch Support System.
	`, req.Username, req.UserEmail, req.Subject, req.Message)

	m.SetBody("text/plain", body)

	// Send email
	d := gomail.NewDialer(smtpHost, smtpPort, smtpUser, smtpPassword)
	
	if err := d.DialAndSend(m); err != nil {
		log.Printf("❌ Failed to send support email: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to send support request. Please try again.",
		})
		return
	}

	log.Printf("✅ Support email sent from %s (%s)", req.Username, req.UserEmail)
	c.JSON(http.StatusOK, gin.H{
		"message": "Support request sent successfully",
	})
}
