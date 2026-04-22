# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth/login.spec.js >> Authentication >> TC-AUTH-004: Logout functionality
- Location: tests/e2e/auth/login.spec.js:54:3

# Error details

```
TimeoutError: locator.fill: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('input[name="email"]')

```

# Page snapshot

```yaml
- generic [ref=e5]:
  - generic [ref=e7]:
    - img "WeWatch Logo" [ref=e8]
    - paragraph [ref=e9]: Watch together, anywhere
    - paragraph [ref=e10]: You define the space. We bring your people together.
  - generic [ref=e12]:
    - generic [ref=e13]:
      - heading "Welcome Back" [level=2] [ref=e14]
      - paragraph [ref=e15]: Sign in to continue your watch party
    - generic [ref=e16]:
      - generic [ref=e17]:
        - generic [ref=e18]:
          - generic [ref=e19]: Email Address
          - textbox "Email Address" [ref=e20]:
            - /placeholder: you@example.com
        - generic [ref=e21]:
          - generic [ref=e22]: Password
          - generic [ref=e23]:
            - textbox "Password" [ref=e24]:
              - /placeholder: ••••••••
            - button "Show password" [ref=e25] [cursor=pointer]:
              - img [ref=e26]
        - generic [ref=e29]:
          - generic [ref=e30] [cursor=pointer]:
            - checkbox "Remember me" [ref=e31]
            - generic [ref=e32]: Remember me
          - link "Forgot password?" [ref=e33] [cursor=pointer]:
            - /url: /forgot-password
        - button "Sign In" [ref=e34] [cursor=pointer]
      - generic [ref=e39]: Or continue with
      - generic [ref=e40]:
        - button "Continue with Google" [ref=e41] [cursor=pointer]:
          - img [ref=e42]
          - generic [ref=e47]: Continue with Google
        - button "Continue with Apple (Coming Soon)" [disabled] [ref=e48]:
          - img [ref=e49]
          - generic [ref=e51]: Continue with Apple
          - generic [ref=e52]: (Coming Soon)
      - paragraph [ref=e53]:
        - text: Don't have an account?
        - link "Create one now" [ref=e54] [cursor=pointer]:
          - /url: /register
    - paragraph [ref=e56]: © 2026 WeWatch. Watch together, anywhere.
```

# Test source

```ts
  1  | /**
  2  |  * Login Page Object
  3  |  * 
  4  |  * Represents the login page and its interactions
  5  |  */
  6  | 
  7  | export class LoginPage {
  8  |   constructor(page) {
  9  |     this.page = page;
  10 |     
  11 |     // Locators
  12 |     this.emailInput = page.locator('input[name="email"]');
  13 |     this.passwordInput = page.locator('input[name="password"]');
  14 |     this.loginButton = page.locator('button[type="submit"]');
  15 |     this.googleButton = page.locator('text=Continue with Google');
  16 |     this.registerLink = page.locator('a[href="/register"]');
  17 |     this.errorMessage = page.locator('.error-message, .toast-error');
  18 |   }
  19 | 
  20 |   async goto() {
  21 |     await this.page.goto('/login');
  22 |   }
  23 | 
  24 |   async login(email, password) {
> 25 |     await this.emailInput.fill(email);
     |                           ^ TimeoutError: locator.fill: Timeout 10000ms exceeded.
  26 |     await this.passwordInput.fill(password);
  27 |     await this.loginButton.click();
  28 |   }
  29 | 
  30 |   async loginWithGoogle() {
  31 |     await this.googleButton.click();
  32 |   }
  33 | 
  34 |   async goToRegister() {
  35 |     await this.registerLink.click();
  36 |   }
  37 | 
  38 |   async getErrorMessage() {
  39 |     return await this.errorMessage.textContent();
  40 |   }
  41 | 
  42 |   async isErrorVisible() {
  43 |     return await this.errorMessage.isVisible();
  44 |   }
  45 | }
  46 | 
```