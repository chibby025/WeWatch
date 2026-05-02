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
		fromAddress:  "support@letswatchout.com",
	}
}

// SendEmail sends an email using SMTP
func (e *EmailService) SendEmail(to, subject, body string) error {
	// DEV MODE: Log email instead of sending (if SMTP not configured or DEV_MODE=true)
	devMode := os.Getenv("DEV_MODE") == "true"
	
	if devMode || e.smtpHost == "" || e.smtpPort == "" || e.smtpUser == "" || e.smtpPassword == "" {
		fmt.Println("==================================================")
		fmt.Printf("📧 [DEV MODE] Email would be sent to: %s\n", to)
		fmt.Printf("📧 [DEV MODE] Subject: %s\n", subject)
		fmt.Println("==================================================")
		fmt.Printf("📧 [DEV MODE] Body:\n%s\n", body)
		fmt.Println("==================================================")
		fmt.Println("📧 [DEV MODE] ✅ Email logged (not actually sent)")
		fmt.Println("==================================================")
		return nil
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

// SendPasswordResetEmail sends email with password reset link
func (e *EmailService) SendPasswordResetEmail(to, username, resetToken string) error {
	// Build reset URL (frontend URL)
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}
	resetURL := fmt.Sprintf("%s/reset-password?token=%s", frontendURL, resetToken)
	
	subject := "Reset Your WeWatch Password"
	
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .button:hover { background-color: #1d4ed8; }
        .warning-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">🔐 Reset Your Password</h1>
        </div>
        <div class="content">
            <p>Hi %s,</p>
            
            <p>We received a request to reset your WeWatch password. Click the button below to choose a new password:</p>
            
            <div style="text-align: center;">
                <a href="%s" class="button" style="color: white;">Reset Password</a>
            </div>
            
            <p style="font-size: 14px; color: #6b7280;">Or copy and paste this link into your browser:</p>
            <p style="font-size: 12px; color: #2563eb; word-break: break-all;">%s</p>
            
            <div class="warning-box">
                <p style="margin: 0;"><strong>⏰ This link expires in 15 minutes</strong></p>
                <p style="margin: 10px 0 0 0; font-size: 14px;">For your security, password reset links are only valid for a short time.</p>
            </div>
            
            <p><strong>Didn't request this?</strong> You can safely ignore this email. Your password won't be changed.</p>
            
            <div class="footer">
                <p>Best regards,<br>WeWatch Security Team</p>
                <p style="font-size: 12px;">This is an automated email. Please do not reply.</p>
            </div>
        </div>
    </div>
</body>
</html>
	`, username, resetURL, resetURL)
	
	return e.SendEmail(to, subject, body)
}

// SendPasswordChangedEmail sends confirmation email after password reset
func (e *EmailService) SendPasswordChangedEmail(to, username string) error {
	subject := "Your WeWatch Password Was Changed"
	
	currentTime := time.Now().Format("January 2, 2006 at 3:04pm MST")
	
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .success-box { background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
        .alert-box { background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">✅ Password Changed Successfully</h1>
        </div>
        <div class="content">
            <p>Hi %s,</p>
            
            <p>This is a confirmation that your WeWatch password was successfully changed.</p>
            
            <div class="success-box">
                <p style="margin: 0;"><strong>⏰ Changed on:</strong> %s</p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #047857;">
                    Your account is now secured with your new password.
                </p>
            </div>
            
            <div class="alert-box">
                <p style="margin: 0;"><strong>⚠️ Didn't make this change?</strong></p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #991b1b;">
                    If you didn't reset your password, your account may have been compromised. 
                    Please contact our support team immediately at support@letswatchout.com
                </p>
            </div>
            
            <p>If you made this change, no further action is needed. You can now log in with your new password.</p>
            
            <div class="footer">
                <p>Best regards,<br>WeWatch Security Team</p>
                <p style="font-size: 12px;">This is an automated email. Please do not reply.</p>
            </div>
        </div>
    </div>
</body>
</html>
	`, username, currentTime)
	
	return e.SendEmail(to, subject, body)
}
