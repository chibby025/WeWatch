package services

import (
	"fmt"
	"net/smtp"
	"os"
	"time"
)

// EmailService handles sending emails via SMTP
type EmailService struct {
	smtpHost     string
	smtpPort     string
	smtpUser     string
	smtpPassword string
	fromAddress  string
}

// NewEmailService creates a new email service using environment variables
func NewEmailService() *EmailService {
	return &EmailService{
		smtpHost:     os.Getenv("SMTP_HOST"),
		smtpPort:     os.Getenv("SMTP_PORT"),
		smtpUser:     os.Getenv("SMTP_USER"),
		smtpPassword: os.Getenv("SMTP_PASSWORD"),
		fromAddress:  "payments@watchout.com",
	}
}

// SendEmail sends an email using SMTP
func (e *EmailService) SendEmail(to, subject, body string) error {
	// Validate configuration
	if e.smtpHost == "" || e.smtpPort == "" || e.smtpUser == "" || e.smtpPassword == "" {
		return fmt.Errorf("email service not configured: missing SMTP environment variables")
	}
	
	// Build email message
	message := []byte(fmt.Sprintf(
		"From: WeWatch Payments <%s>\r\n"+
			"To: %s\r\n"+
			"Subject: %s\r\n"+
			"MIME-Version: 1.0\r\n"+
			"Content-Type: text/html; charset=\"UTF-8\"\r\n"+
			"\r\n"+
			"%s\r\n",
		e.fromAddress, to, subject, body,
	))
	
	// Connect to SMTP server
	auth := smtp.PlainAuth("", e.smtpUser, e.smtpPassword, e.smtpHost)
	addr := fmt.Sprintf("%s:%s", e.smtpHost, e.smtpPort)
	
	// Send email
	err := smtp.SendMail(addr, auth, e.fromAddress, []string{to}, message)
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}
	
	fmt.Printf("📧 Email sent to %s: %s\n", to, subject)
	return nil
}

// SendWithdrawalSubmittedEmail sends email when withdrawal is submitted
func (e *EmailService) SendWithdrawalSubmittedEmail(to, username string, amount float64, currency string) error {
	// Calculate estimated arrival (24 hours from now)
	arrivalTime := time.Now().Add(24 * time.Hour)
	formattedTime := arrivalTime.Format("January 2, 2006 at 3:04pm")
	
	subject := fmt.Sprintf("Withdrawal Processing - %s%.2f", getCurrencySymbol(currency), amount)
	
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .amount { font-size: 32px; font-weight: bold; color: #2563eb; margin: 20px 0; }
        .info-box { background-color: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">💰 Withdrawal Processing</h1>
        </div>
        <div class="content">
            <p>Hi %s,</p>
            
            <p>Your withdrawal request has been submitted successfully!</p>
            
            <div style="text-align: center;">
                <div class="amount">%s%.2f</div>
            </div>
            
            <div class="info-box">
                <p style="margin: 0;"><strong>⏳ Estimated Arrival:</strong> %s</p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #1e40af;">
                    Bank transfers take 24 hours to process (Paystack processing time, not ours)
                </p>
            </div>
            
            <p><strong>Status:</strong> Processing by Paystack</p>
            
            <p>You'll receive another email when the funds arrive in your bank account.</p>
            
            <p>If you have any questions, please contact our support team.</p>
            
            <div class="footer">
                <p>Best regards,<br>WeWatch Payments Team</p>
                <p style="font-size: 12px;">This is an automated email. Please do not reply.</p>
            </div>
        </div>
    </div>
</body>
</html>
	`, username, getCurrencySymbol(currency), amount, formattedTime)
	
	return e.SendEmail(to, subject, body)
}

// SendWithdrawalCompletedEmail sends email when withdrawal is completed
func (e *EmailService) SendWithdrawalCompletedEmail(to, username string, amount float64, currency string) error {
	subject := fmt.Sprintf("Withdrawal Complete - %s%.2f Sent", getCurrencySymbol(currency), amount)
	
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .amount { font-size: 32px; font-weight: bold; color: #10b981; margin: 20px 0; }
        .success-box { background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">✅ Withdrawal Complete</h1>
        </div>
        <div class="content">
            <p>Hi %s,</p>
            
            <p>Great news! Your withdrawal has been completed successfully.</p>
            
            <div style="text-align: center;">
                <div class="amount">%s%.2f</div>
            </div>
            
            <div class="success-box">
                <p style="margin: 0;"><strong>✅ Status:</strong> Funds have been sent to your bank account</p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #047857;">
                    The money should appear in your account within a few minutes to a few hours, depending on your bank.
                </p>
            </div>
            
            <p>Thank you for using WeWatch!</p>
            
            <div class="footer">
                <p>Best regards,<br>WeWatch Payments Team</p>
                <p style="font-size: 12px;">This is an automated email. Please do not reply.</p>
            </div>
        </div>
    </div>
</body>
</html>
	`, username, getCurrencySymbol(currency), amount)
	
	return e.SendEmail(to, subject, body)
}

// SendWithdrawalFailedEmail sends email when withdrawal fails
func (e *EmailService) SendWithdrawalFailedEmail(to, username string, amount float64, currency string, reason string) error {
	subject := fmt.Sprintf("Withdrawal Failed - %s%.2f", getCurrencySymbol(currency), amount)
	
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .amount { font-size: 32px; font-weight: bold; color: #ef4444; margin: 20px 0; }
        .error-box { background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">❌ Withdrawal Failed</h1>
        </div>
        <div class="content">
            <p>Hi %s,</p>
            
            <p>Unfortunately, your withdrawal request could not be completed.</p>
            
            <div style="text-align: center;">
                <div class="amount">%s%.2f</div>
            </div>
            
            <div class="error-box">
                <p style="margin: 0;"><strong>❌ Reason:</strong> %s</p>
            </div>
            
            <p>Your funds have been returned to your wallet and are available for withdrawal.</p>
            
            <p>Please check your bank account details and try again. If the problem persists, contact our support team.</p>
            
            <div class="footer">
                <p>Best regards,<br>WeWatch Payments Team</p>
                <p style="font-size: 12px;">This is an automated email. Please do not reply.</p>
            </div>
        </div>
    </div>
</body>
</html>
	`, username, getCurrencySymbol(currency), amount, reason)
	
	return e.SendEmail(to, subject, body)
}

// getCurrencySymbol returns the symbol for a currency code
func getCurrencySymbol(currency string) string {
	symbols := map[string]string{
		"NGN": "₦",
		"USD": "$",
		"EUR": "€",
		"GBP": "£",
		"GHS": "₵",
		"KES": "KSh",
		"ZAR": "R",
	}
	
	if symbol, ok := symbols[currency]; ok {
		return symbol
	}
	return currency + " "
}
