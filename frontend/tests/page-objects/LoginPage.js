/**
 * Login Page Object
 * 
 * Represents the login page and its interactions
 */

export class LoginPage {
  constructor(page) {
    this.page = page;
    
    // Locators
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.loginButton = page.locator('button[type="submit"]');
    this.googleButton = page.locator('text=Continue with Google');
    this.registerLink = page.locator('a[href="/register"]');
    this.errorMessage = page.locator('.error-message, .toast-error');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async loginWithGoogle() {
    await this.googleButton.click();
  }

  async goToRegister() {
    await this.registerLink.click();
  }

  async getErrorMessage() {
    return await this.errorMessage.textContent();
  }

  async isErrorVisible() {
    return await this.errorMessage.isVisible();
  }
}
