package services

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"gopkg.in/gomail.v2"
)

// EmailService handles sending transactional emails via Brevo SMTP relay.
type EmailService struct {
	smtpHost    string
	smtpPort    int
	smtpUser    string
	smtpPass    string
	fromAddress string
	fromName    string
	devMode     bool
}

// NewEmailService reads SMTP config from environment variables.
// SMTP_USER  — Brevo account login email (used for SMTP authentication)
// SMTP_FROM  — sender address shown in the email (e.g. noreply@letswatchout.com)
// SMTP_FROM_NAME — display name (defaults to "LetsWatchOut")
func NewEmailService() *EmailService {
	port := 587
	if p, err := strconv.Atoi(os.Getenv("SMTP_PORT")); err == nil && p > 0 {
		port = p
	}

	fromAddr := os.Getenv("SMTP_FROM")
	if fromAddr == "" {
		fromAddr = os.Getenv("SMTP_USER") // fallback
	}
	fromName := os.Getenv("SMTP_FROM_NAME")
	if fromName == "" {
		fromName = "LetsWatchOut"
	}

	return &EmailService{
		smtpHost:    os.Getenv("SMTP_HOST"),
		smtpPort:    port,
		smtpUser:    os.Getenv("SMTP_USER"),
		smtpPass:    os.Getenv("SMTP_PASSWORD"),
		fromAddress: fromAddr,
		fromName:    fromName,
		devMode:     os.Getenv("DEV_MODE") == "true",
	}
}

func (e *EmailService) isConfigured() bool {
	return e.smtpHost != "" && e.smtpUser != "" && e.smtpPass != ""
}

// SendEmail sends an HTML email. Falls back to console logging in dev mode or when SMTP is unconfigured.
func (e *EmailService) SendEmail(to, subject, htmlBody string) error {
	return e.send(to, "", subject, htmlBody)
}

func (e *EmailService) send(to, toName, subject, htmlBody string) error {
	if e.devMode || !e.isConfigured() {
		fmt.Println("==================================================")
		fmt.Printf("📧 [DEV] To: %s\n", to)
		fmt.Printf("📧 [DEV] Subject: %s\n", subject)
		fmt.Println("==================================================")
		return nil
	}

	m := gomail.NewMessage()
	m.SetAddressHeader("From", e.fromAddress, e.fromName)
	if toName != "" {
		m.SetAddressHeader("To", to, toName)
	} else {
		m.SetHeader("To", to)
	}
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", htmlBody)

	d := gomail.NewDialer(e.smtpHost, e.smtpPort, e.smtpUser, e.smtpPass)
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("email send failed: %w", err)
	}

	fmt.Printf("📧 Sent: %s → %s\n", subject, to)
	return nil
}

// ─── Shared template helpers ────────────────────────────────────────────────

func emailWrap(accentColor, headerIcon, headerTitle, body string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:0}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .hdr{background:%s;padding:28px 32px;text-align:center;color:#fff}
  .hdr h1{margin:0;font-size:22px;font-weight:700}
  .hdr .icon{font-size:36px;margin-bottom:8px}
  .body{padding:32px}
  .amount{font-size:36px;font-weight:800;color:%s;text-align:center;margin:20px 0}
  .box{border-left:4px solid %s;background:#f8faff;padding:16px;margin:20px 0;border-radius:0 8px 8px 0}
  .box p{margin:4px 0;font-size:14px}
  .btn{display:inline-block;background:%s;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:20px 0}
  .footer{text-align:center;padding:20px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px}
</style></head>
<body><div class="wrap">
  <div class="hdr"><div class="icon">%s</div><h1>%s</h1></div>
  <div class="body">%s</div>
  <div class="footer">
    LetsWatchOut · <a href="mailto:support@letswatchout.com" style="color:#6b7280">support@letswatchout.com</a><br>
    This is an automated message — please do not reply directly.
  </div>
</div></body></html>`,
		accentColor, accentColor, accentColor, accentColor,
		headerIcon, headerTitle, body)
}

func currencySymbol(currency string) string {
	symbols := map[string]string{
		"NGN": "₦", "USD": "$", "EUR": "€",
		"GBP": "£", "GHS": "₵", "KES": "KSh",
	}
	if s, ok := symbols[currency]; ok {
		return s
	}
	return currency + " "
}

// getCurrencySymbol is kept for backwards compatibility with existing callers.
func getCurrencySymbol(currency string) string { return currencySymbol(currency) }

// ─── Token purchase ──────────────────────────────────────────────────────────

func (e *EmailService) SendTokenPurchaseReceiptEmail(to, username string, amountNGN float64, tokensAdded int, reference string) error {
	subject := fmt.Sprintf("You bought %.2f tokens — receipt", float64(tokensAdded)/100.0)
	body := fmt.Sprintf(`
<p>Hi <strong>%s</strong>,</p>
<p>Your token purchase was successful. Here's your receipt:</p>
<div class="amount">%.2f tokens</div>
<div class="box">
  <p><strong>Amount paid:</strong> ₦%.2f</p>
  <p><strong>Reference:</strong> %s</p>
  <p><strong>Date:</strong> %s</p>
</div>
<p>Your tokens are ready to use — buy event tickets, send gifts, or tip creators.</p>
<p>Thanks for supporting the community!</p>`,
		username,
		float64(tokensAdded)/100.0,
		amountNGN,
		reference,
		time.Now().Format("2 Jan 2006, 3:04 PM"),
	)
	return e.send(to, username, subject, emailWrap("#7c3aed", "🪙", "Token Purchase Receipt", body))
}

// ─── Withdrawal emails ───────────────────────────────────────────────────────

func (e *EmailService) SendWithdrawalSubmittedEmail(to, username string, amount float64, currency string) error {
	sym := currencySymbol(currency)
	subject := fmt.Sprintf("Withdrawal of %s%.2f submitted", sym, amount)
	body := fmt.Sprintf(`
<p>Hi <strong>%s</strong>,</p>
<p>We've received your withdrawal request and it's being reviewed.</p>
<div class="amount">%s%.2f</div>
<div class="box">
  <p><strong>Status:</strong> Pending review</p>
  <p><strong>Estimated arrival:</strong> Within 24 hours</p>
  <p><strong>Date submitted:</strong> %s</p>
</div>
<p>You'll get another email once the funds have been sent to your bank account.</p>`,
		username, sym, amount,
		time.Now().Format("2 Jan 2006, 3:04 PM"),
	)
	return e.send(to, username, subject, emailWrap("#2563eb", "💸", "Withdrawal Submitted", body))
}

func (e *EmailService) SendWithdrawalCompletedEmail(to, username string, amount float64, currency string) error {
	sym := currencySymbol(currency)
	subject := fmt.Sprintf("Withdrawal of %s%.2f completed", sym, amount)
	body := fmt.Sprintf(`
<p>Hi <strong>%s</strong>,</p>
<p>Your withdrawal has been processed and the funds are on their way.</p>
<div class="amount">%s%.2f</div>
<div class="box">
  <p><strong>Status:</strong> Sent to your bank account</p>
  <p><strong>Date:</strong> %s</p>
</div>
<p>Funds typically appear within a few minutes to a few hours depending on your bank.</p>
<p>Thank you for being part of LetsWatchOut!</p>`,
		username, sym, amount,
		time.Now().Format("2 Jan 2006, 3:04 PM"),
	)
	return e.send(to, username, subject, emailWrap("#10b981", "✅", "Withdrawal Completed", body))
}

func (e *EmailService) SendWithdrawalFailedEmail(to, username string, amount float64, currency, reason string) error {
	sym := currencySymbol(currency)
	subject := fmt.Sprintf("Withdrawal of %s%.2f could not be processed", sym, amount)
	body := fmt.Sprintf(`
<p>Hi <strong>%s</strong>,</p>
<p>Unfortunately your withdrawal request could not be completed.</p>
<div class="amount">%s%.2f</div>
<div class="box">
  <p><strong>Reason:</strong> %s</p>
</div>
<p>Your tokens have been returned to your wallet and are available to withdraw again.</p>
<p>Please double-check your bank account details and try again. If the issue persists, contact <a href="mailto:support@letswatchout.com">support@letswatchout.com</a>.</p>`,
		username, sym, amount, reason,
	)
	return e.send(to, username, subject, emailWrap("#ef4444", "❌", "Withdrawal Failed", body))
}

// ─── Ticket purchase ─────────────────────────────────────────────────────────

func (e *EmailService) SendTicketPurchaseEmail(to, username, sessionTitle string, ticketPriceTokens int, currency string, isGift bool, giftedByUsername string) error {
	subject := fmt.Sprintf("Your ticket for \"%s\"", sessionTitle)
	recipientLine := ""
	if isGift {
		recipientLine = fmt.Sprintf(`<p>This ticket was gifted to you by <strong>%s</strong>.</p>`, giftedByUsername)
	}
	body := fmt.Sprintf(`
<p>Hi <strong>%s</strong>,</p>
%s
<p>Your ticket has been confirmed for:</p>
<div class="box">
  <p><strong>Event:</strong> %s</p>
  <p><strong>Price paid:</strong> %.2f tokens</p>
  <p><strong>Date:</strong> %s</p>
</div>
<p>Show up a few minutes early. Enjoy the session!</p>`,
		username,
		recipientLine,
		sessionTitle,
		float64(ticketPriceTokens)/100.0,
		time.Now().Format("2 Jan 2006, 3:04 PM"),
	)
	return e.send(to, username, subject, emailWrap("#f59e0b", "🎟️", "Ticket Confirmed", body))
}

// ─── Account deletion ────────────────────────────────────────────────────────

func (e *EmailService) SendAccountDeletionEmail(to, username string) error {
	subject := "Your LetsWatchOut account has been deleted"
	body := fmt.Sprintf(`
<p>Hi <strong>%s</strong>,</p>
<p>Your account deletion request has been processed. Your personal information has been removed from our systems.</p>
<div class="box">
  <p><strong>Deleted on:</strong> %s</p>
  <p><strong>What was removed:</strong> Profile, bio, linked accounts, payment methods</p>
  <p><strong>What is retained:</strong> Transaction records (required by CBN regulations for 7 years)</p>
</div>
<p>If you did not request this deletion or believe this was an error, contact us immediately at <a href="mailto:support@letswatchout.com">support@letswatchout.com</a>.</p>
<p>We're sorry to see you go. You're always welcome back.</p>`,
		username,
		time.Now().Format("2 Jan 2006, 3:04 PM"),
	)
	return e.send(to, username, subject, emailWrap("#6b7280", "👋", "Account Deleted", body))
}

// ─── Security emails (already used) ─────────────────────────────────────────

func (e *EmailService) SendPasswordResetEmail(to, username, resetToken string) error {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}
	resetURL := fmt.Sprintf("%s/reset-password?token=%s", frontendURL, resetToken)
	subject := "Reset your LetsWatchOut password"
	body := fmt.Sprintf(`
<p>Hi <strong>%s</strong>,</p>
<p>We received a request to reset your password. Click the button below — this link expires in <strong>15 minutes</strong>.</p>
<div style="text-align:center"><a href="%s" class="btn">Reset Password</a></div>
<p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br>%s</p>
<div class="box">
  <p><strong>Didn't request this?</strong> You can safely ignore this email. Your password won't change.</p>
</div>`,
		username, resetURL, resetURL,
	)
	return e.send(to, username, subject, emailWrap("#2563eb", "🔐", "Reset Your Password", body))
}

func (e *EmailService) SendWelcomeEmail(to, username string) error {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "https://letswatchout.com"
	}
	subject := "Welcome to LetsWatchOut 🎬"
	body := fmt.Sprintf(`
<p>Hi <strong>%s</strong>,</p>
<p>Welcome to <strong>LetsWatchOut</strong> — the place to co-watch movies, live streams, church services, classes, and more with people you actually want to watch with.</p>
<div class="box">
  <p><strong>Here's what you can do:</strong></p>
  <p>🎬 &nbsp;Create or join a room and watch together in real time</p>
  <p>💬 &nbsp;Chat, react, and vibe with your room during sessions</p>
  <p>📅 &nbsp;Schedule events so your crew never misses a watch</p>
  <p>🎙️ &nbsp;Host podcasts, classes, or church services in your own room</p>
</div>
<p>Your account is all set — jump in and start watching.</p>
<p style="text-align:center">
  <a href="%s/lobby" class="btn">Go to LetsWatchOut →</a>
</p>
<p style="color:#6b7280;font-size:13px">Questions? Reply to this email or reach us at <a href="mailto:support@letswatchout.com">support@letswatchout.com</a></p>`,
		username, frontendURL,
	)
	return e.send(to, username, subject, emailWrap("#7c3aed", "🎬", "Welcome to LetsWatchOut", body))
}

func (e *EmailService) SendPasswordChangedEmail(to, username string) error {
	subject := "Your LetsWatchOut password was changed"
	body := fmt.Sprintf(`
<p>Hi <strong>%s</strong>,</p>
<p>Your password was successfully changed on <strong>%s</strong>.</p>
<div class="box">
  <p><strong>⚠️ Didn't make this change?</strong> Contact us immediately at <a href="mailto:support@letswatchout.com">support@letswatchout.com</a></p>
</div>`,
		username,
		time.Now().Format("2 Jan 2006, 3:04 PM"),
	)
	return e.send(to, username, subject, emailWrap("#10b981", "✅", "Password Changed", body))
}
