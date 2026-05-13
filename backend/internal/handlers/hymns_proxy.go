// backend/internal/handlers/hymns_proxy.go
// Proxy for Hymnary.org API to bypass CORS restrictions

package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	hymnaryAPIBase = "https://hymnary.org/api"
	requestTimeout = 10 * time.Second
)

// SearchHymnsProxy proxies hymn search requests to Hymnary.org
// GET /api/hymns/search?query=amazing+grace
func SearchHymnsProxy(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "query parameter is required"})
		return
	}

	// Build Hymnary.org API URL
	apiURL := fmt.Sprintf("%s/hymn.json?query=%s&max=20", hymnaryAPIBase, url.QueryEscape(query))
	log.Printf("🎵 [HymnProxy] Searching hymns: query='%s'", query)

	// Make request to Hymnary.org (no CORS restrictions server-to-server)
	client := &http.Client{Timeout: requestTimeout}
	resp, err := client.Get(apiURL)
	if err != nil {
		log.Printf("❌ [HymnProxy] Search failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hymns from Hymnary.org"})
		return
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		log.Printf("⚠️ [HymnProxy] Hymnary.org returned status %d", resp.StatusCode)
		c.JSON(resp.StatusCode, gin.H{"error": fmt.Sprintf("Hymnary.org API error: %d", resp.StatusCode)})
		return
	}

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("❌ [HymnProxy] Failed to read response: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read hymn data"})
		return
	}

	// Parse and validate JSON
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		log.Printf("❌ [HymnProxy] Invalid JSON from Hymnary.org: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid response from Hymnary.org"})
		return
	}

	log.Printf("✅ [HymnProxy] Search successful: found %v results", len(result))

	// Set CORS headers
	origin := c.Request.Header.Get("Origin")
	if origin != "" {
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Credentials", "true")
	}

	// Return proxied response
	c.Data(http.StatusOK, "application/json", body)
}

// GetHymnDetailsProxy proxies hymn detail requests to Hymnary.org
// GET /api/hymns/:id
func GetHymnDetailsProxy(c *gin.Context) {
	hymnID := c.Param("id")
	if hymnID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hymn ID is required"})
		return
	}

	// Build Hymnary.org API URL
	apiURL := fmt.Sprintf("%s/hymn/%s.json", hymnaryAPIBase, hymnID)
	log.Printf("🎵 [HymnProxy] Fetching hymn details: id='%s'", hymnID)

	// Make request to Hymnary.org
	client := &http.Client{Timeout: requestTimeout}
	resp, err := client.Get(apiURL)
	if err != nil {
		log.Printf("❌ [HymnProxy] Details fetch failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hymn details from Hymnary.org"})
		return
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		log.Printf("⚠️ [HymnProxy] Hymnary.org returned status %d for hymn %s", resp.StatusCode, hymnID)
		c.JSON(resp.StatusCode, gin.H{"error": fmt.Sprintf("Hymnary.org API error: %d", resp.StatusCode)})
		return
	}

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("❌ [HymnProxy] Failed to read response: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read hymn details"})
		return
	}

	// Validate JSON
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		log.Printf("❌ [HymnProxy] Invalid JSON from Hymnary.org: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid response from Hymnary.org"})
		return
	}

	log.Printf("✅ [HymnProxy] Hymn details fetched: %s", hymnID)

	// Set CORS headers
	origin := c.Request.Header.Get("Origin")
	if origin != "" {
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Credentials", "true")
	}

	// Return proxied response
	c.Data(http.StatusOK, "application/json", body)
}
