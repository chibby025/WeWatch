// WeWatch/backend/internal/utils/currency_service.go
package utils

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

// CurrencyService handles currency conversion
type CurrencyService struct {
	apiKey       string
	baseURL      string
	cache        map[string]*CachedRate
	cacheLock    sync.RWMutex
	cacheDuration time.Duration
}

// CachedRate stores exchange rate with expiry
type CachedRate struct {
	Rate      float64
	ExpiresAt time.Time
}

// ExchangeRateAPIResponse represents the API response from exchangerate-api.com
type ExchangeRateAPIResponse struct {
	Result           string             `json:"result"`
	BaseCode         string             `json:"base_code"`
	ConversionRates  map[string]float64 `json:"conversion_rates"`
	TimeLastUpdateUnix int64            `json:"time_last_update_unix"`
}

// IPAPIResponse represents the IP geolocation response from ipapi.co
type IPAPIResponse struct {
	IP       string `json:"ip"`
	City     string `json:"city"`
	Region   string `json:"region"`
	Country  string `json:"country_name"`
	Currency string `json:"currency"`
}

// NewCurrencyService creates a new currency service
func NewCurrencyService(apiKey string) *CurrencyService {
	if apiKey == "" {
		// Free tier endpoint (no API key, limited to 1,500 requests/month)
		apiKey = "latest"
	}

	return &CurrencyService{
		apiKey:        apiKey,
		baseURL:       "https://api.exchangerate-api.com/v4/latest",
		cache:         make(map[string]*CachedRate),
		cacheDuration: 1 * time.Hour, // Cache for 1 hour
	}
}

// GetExchangeRate fetches exchange rate from base currency to target currency
func (cs *CurrencyService) GetExchangeRate(fromCurrency, toCurrency string) (float64, error) {
	// Check cache first
	cacheKey := fmt.Sprintf("%s_%s", fromCurrency, toCurrency)
	cs.cacheLock.RLock()
	cached, exists := cs.cache[cacheKey]
	cs.cacheLock.RUnlock()

	if exists && time.Now().Before(cached.ExpiresAt) {
		log.Printf("💰 Cache hit for %s → %s: %.4f", fromCurrency, toCurrency, cached.Rate)
		return cached.Rate, nil
	}

	// Fetch from API
	log.Printf("📡 Fetching exchange rate: %s → %s", fromCurrency, toCurrency)
	url := fmt.Sprintf("%s/%s", cs.baseURL, fromCurrency)

	resp, err := http.Get(url)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch exchange rate: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var apiResp ExchangeRateAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return 0, fmt.Errorf("failed to decode API response: %w", err)
	}

	if apiResp.Result != "success" {
		return 0, fmt.Errorf("API returned error result: %s", apiResp.Result)
	}

	rate, exists := apiResp.ConversionRates[toCurrency]
	if !exists {
		return 0, fmt.Errorf("currency not found: %s", toCurrency)
	}

	// Cache the rate
	cs.cacheLock.Lock()
	cs.cache[cacheKey] = &CachedRate{
		Rate:      rate,
		ExpiresAt: time.Now().Add(cs.cacheDuration),
	}
	cs.cacheLock.Unlock()

	log.Printf("💰 Exchange rate cached: %s → %s = %.4f", fromCurrency, toCurrency, rate)
	return rate, nil
}

// ConvertAmount converts an amount from one currency to another
func (cs *CurrencyService) ConvertAmount(amount float64, fromCurrency, toCurrency string) (float64, error) {
	if fromCurrency == toCurrency {
		return amount, nil
	}

	rate, err := cs.GetExchangeRate(fromCurrency, toCurrency)
	if err != nil {
		return 0, err
	}

	converted := amount * rate
	log.Printf("💵 Converted %.2f %s to %.2f %s (rate: %.4f)", amount, fromCurrency, converted, toCurrency, rate)
	return converted, nil
}

// DetectUserCurrency detects user's currency from IP address
func (cs *CurrencyService) DetectUserCurrency(ipAddress string) (string, error) {
	if ipAddress == "" || ipAddress == "::1" || ipAddress == "127.0.0.1" {
		// Default to USD for localhost
		return "USD", nil
	}

	log.Printf("🌍 Detecting currency for IP: %s", ipAddress)
	url := fmt.Sprintf("https://ipapi.co/%s/json/", ipAddress)

	resp, err := http.Get(url)
	if err != nil {
		log.Printf("❌ Failed to detect currency: %v", err)
		return "USD", nil // Fallback to USD
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("⚠️ IP API returned status %d, defaulting to USD", resp.StatusCode)
		return "USD", nil
	}

	var ipResp IPAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&ipResp); err != nil {
		log.Printf("❌ Failed to decode IP API response: %v", err)
		return "USD", nil
	}

	if ipResp.Currency == "" {
		log.Printf("⚠️ No currency found for IP, defaulting to USD")
		return "USD", nil
	}

	log.Printf("✅ Detected currency: %s (Country: %s)", ipResp.Currency, ipResp.Country)
	return ipResp.Currency, nil
}

// GetSupportedCurrencies returns list of supported currencies for WeWatch
func (cs *CurrencyService) GetSupportedCurrencies() []string {
	return []string{"USD", "NGN", "GHS", "KES", "EUR", "GBP"}
}

// ValidateCurrency checks if currency is supported
func (cs *CurrencyService) ValidateCurrency(currency string) bool {
	supported := cs.GetSupportedCurrencies()
	for _, c := range supported {
		if c == currency {
			return true
		}
	}
	return false
}

// ClearCache clears the exchange rate cache
func (cs *CurrencyService) ClearCache() {
	cs.cacheLock.Lock()
	defer cs.cacheLock.Unlock()
	cs.cache = make(map[string]*CachedRate)
	log.Println("🗑️ Currency exchange rate cache cleared")
}

// GetTokenPrice returns token price in specified currency
func (cs *CurrencyService) GetTokenPrice(currency string) (float64, error) {
	// Base price: 1 token = $0.10 USD
	basePrice := 0.10

	if currency == "USD" {
		return basePrice, nil
	}

	return cs.ConvertAmount(basePrice, "USD", currency)
}

// GetTokenPriceForPackage returns total price for token package in user's currency
func (cs *CurrencyService) GetTokenPriceForPackage(tokens int, currency string) (float64, error) {
	// Token price: $0.10 per token (no bulk discount per spec)
	usdPrice := float64(tokens) * 0.10

	if currency == "USD" {
		return usdPrice, nil
	}

	return cs.ConvertAmount(usdPrice, "USD", currency)
}
