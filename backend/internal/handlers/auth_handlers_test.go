package handlers

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http/httptest"
    "testing"
    "github.com/gin-gonic/gin"
    "github.com/stretchr/testify/assert"
    "gorm.io/driver/sqlite"
    "gorm.io/gorm"
    "wewatch-backend/internal/models"
    "wewatch-backend/internal/utils"
)

// setupTestDB creates an in-memory SQLite database for testing
func setupTestDB() *gorm.DB {
    db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
    if err != nil {
        panic("failed to connect to test database: " + err.Error())
    }
    
    // Auto-migrate all models
    db.AutoMigrate(&models.User{}, &models.UserWallet{})
    
    return db
}

func TestRegisterUser(t *testing.T) {
    // Set up test cases (table-driven testing)
    tests := []struct {
        name           string
        requestBody    map[string]interface{}
        expectedStatus int
        expectedError  string
    }{
        {
            name: "Valid registration",
            requestBody: map[string]interface{}{
                "email":    "test@example.com",
                "password": "SecurePass123!",
                "username": "testuser",
            },
            expectedStatus: 201,
            expectedError:  "",
        },
        {
            name: "Missing email",
            requestBody: map[string]interface{}{
                "password": "SecurePass123!",
                "username": "testuser",
            },
            expectedStatus: 400,
            expectedError:  "Email",
        },
        {
            name: "Weak password",
            requestBody: map[string]interface{}{
                "email":    "test@example.com",
                "password": "123",
                "username": "testuser",
            },
            expectedStatus: 400,
            expectedError:  "Password",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Setup test database
            DB = setupTestDB()
            
            // Setup Gin
            gin.SetMode(gin.TestMode)
            router := gin.New()
            router.POST("/register", RegisterHandler)

            // Create request
            body, _ := json.Marshal(tt.requestBody)
            req := httptest.NewRequest("POST", "/register", bytes.NewBuffer(body))
            req.Header.Set("Content-Type", "application/json")
            
            // Record response
            w := httptest.NewRecorder()
            router.ServeHTTP(w, req)

            // Assertions
            assert.Equal(t, tt.expectedStatus, w.Code)
            
            if tt.expectedError != "" {
                var response map[string]interface{}
                json.Unmarshal(w.Body.Bytes(), &response)
                assert.Contains(t, response["error"], tt.expectedError)
            }
        })
    }
}

func TestLoginUser(t *testing.T) {
    tests := []struct {
        name           string
        setupUser      bool // Whether to create a user first
        userEmail      string
        userPassword   string
        loginBody      map[string]interface{}
        expectedStatus int
        expectedError  string
    }{
        {
            name:         "Valid login",
            setupUser:    true,
            userEmail:    "login@example.com",
            userPassword: "SecurePass123!",
            loginBody: map[string]interface{}{
                "email":    "login@example.com",
                "password": "SecurePass123!",
            },
            expectedStatus: 200,
            expectedError:  "",
        },
        {
            name:         "Wrong password",
            setupUser:    true,
            userEmail:    "user@example.com",
            userPassword: "CorrectPass123!",
            loginBody: map[string]interface{}{
                "email":    "user@example.com",
                "password": "WrongPass123!",
            },
            expectedStatus: 401,
            expectedError:  "Invalid credentials",
        },
        {
            name:      "User does not exist",
            setupUser: false,
            loginBody: map[string]interface{}{
                "email":    "nonexistent@example.com",
                "password": "SomePass123!",
            },
            expectedStatus: 401,
            expectedError:  "Invalid credentials",
        },
        {
            name:      "Missing email",
            setupUser: false,
            loginBody: map[string]interface{}{
                "password": "SomePass123!",
            },
            expectedStatus: 400,
            expectedError:  "Email",
        },
        {
            name:      "Missing password",
            setupUser: false,
            loginBody: map[string]interface{}{
                "email": "test@example.com",
            },
            expectedStatus: 400,
            expectedError:  "Password",
        },
        {
            name:      "Invalid email format",
            setupUser: false,
            loginBody: map[string]interface{}{
                "email":    "notanemail",
                "password": "SomePass123!",
            },
            expectedStatus: 400,
            expectedError:  "Email",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Setup test database
            DB = setupTestDB()

            // Create user if needed for this test
            if tt.setupUser {
                hashedPassword, err := utils.HashPassword(tt.userPassword)
                if err != nil {
                    t.Fatalf("Failed to hash password: %v", err)
                }
                user := models.User{
                    Username:     "testuser",
                    Email:        tt.userEmail,
                    PasswordHash: hashedPassword,
                }
                if err := DB.Create(&user).Error; err != nil {
                    t.Fatalf("Failed to create test user: %v", err)
                }
            }

            // Setup Gin
            gin.SetMode(gin.TestMode)
            router := gin.New()
            router.POST("/login", LoginHandler)

            // Create request
            body, _ := json.Marshal(tt.loginBody)
            req := httptest.NewRequest("POST", "/login", bytes.NewBuffer(body))
            req.Header.Set("Content-Type", "application/json")

            // Record response
            w := httptest.NewRecorder()
            router.ServeHTTP(w, req)

            // Assertions
            assert.Equal(t, tt.expectedStatus, w.Code)

            if tt.expectedError != "" {
                var response map[string]interface{}
                json.Unmarshal(w.Body.Bytes(), &response)
                assert.Contains(t, fmt.Sprintf("%v", response["error"]), tt.expectedError)
            }

            // For successful login, verify response contains user data
            if tt.expectedStatus == 200 {
                var response map[string]interface{}
                json.Unmarshal(w.Body.Bytes(), &response)
                assert.Equal(t, "Login successful", response["message"])
                assert.NotNil(t, response["user"])
                
                // Check that cookie was set
                cookies := w.Result().Cookies()
                foundCookie := false
                for _, cookie := range cookies {
                    if cookie.Name == "wewatch_token" {
                        foundCookie = true
                        assert.NotEmpty(t, cookie.Value)
                        assert.True(t, cookie.HttpOnly)
                    }
                }
                assert.True(t, foundCookie, "JWT cookie should be set")
            }
        })
    }
}

func TestRegisterUserDuplicates(t *testing.T) {
    // Setup test database
    DB = setupTestDB()

    // Create an existing user
    hashedPassword, _ := utils.HashPassword("ExistingPass123!")
    existingUser := models.User{
        Username:     "existinguser",
        Email:        "existing@example.com",
        PasswordHash: hashedPassword,
    }
    DB.Create(&existingUser)

    tests := []struct {
        name           string
        requestBody    map[string]interface{}
        expectedStatus int
        expectedError  string
    }{
        {
            name: "Duplicate email",
            requestBody: map[string]interface{}{
                "email":    "existing@example.com",
                "password": "NewPass123!",
                "username": "newuser",
            },
            expectedStatus: 409,
            expectedError:  "already exists",
        },
        {
            name: "Duplicate username",
            requestBody: map[string]interface{}{
                "email":    "newemail@example.com",
                "password": "NewPass123!",
                "username": "existinguser",
            },
            expectedStatus: 409,
            expectedError:  "already exists",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Setup Gin
            gin.SetMode(gin.TestMode)
            router := gin.New()
            router.POST("/register", RegisterHandler)

            // Create request
            body, _ := json.Marshal(tt.requestBody)
            req := httptest.NewRequest("POST", "/register", bytes.NewBuffer(body))
            req.Header.Set("Content-Type", "application/json")

            // Record response
            w := httptest.NewRecorder()
            router.ServeHTTP(w, req)

            // Assertions
            assert.Equal(t, tt.expectedStatus, w.Code)

            var response map[string]interface{}
            json.Unmarshal(w.Body.Bytes(), &response)
            assert.Contains(t, fmt.Sprintf("%v", response["error"]), tt.expectedError)
        })
    }
}

func TestRegisterUserCreatesWallet(t *testing.T) {
    // Setup test database
    DB = setupTestDB()

    // Setup Gin
    gin.SetMode(gin.TestMode)
    router := gin.New()
    router.POST("/register", RegisterHandler)

    // Create registration request
    requestBody := map[string]interface{}{
        "email":    "wallettest@example.com",
        "password": "SecurePass123!",
        "username": "walletuser",
    }

    body, _ := json.Marshal(requestBody)
    req := httptest.NewRequest("POST", "/register", bytes.NewBuffer(body))
    req.Header.Set("Content-Type", "application/json")

    // Record response
    w := httptest.NewRecorder()
    router.ServeHTTP(w, req)

    // Assert successful registration
    assert.Equal(t, 201, w.Code)

    // Verify user was created
    var user models.User
    err := DB.Where("email = ?", "wallettest@example.com").First(&user).Error
    assert.NoError(t, err)
    assert.Equal(t, "walletuser", user.Username)

    // Verify wallet was created for the user
    var wallet models.UserWallet
    err = DB.Where("user_id = ?", user.ID).First(&wallet).Error
    assert.NoError(t, err)
    assert.Equal(t, user.ID, wallet.UserID)
    assert.Equal(t, 0, wallet.TokenBalance)
    assert.Equal(t, 0, wallet.LifetimeEarned)
    assert.Equal(t, 0, wallet.LifetimeSpent)
}

func TestRegisterUserReturnsToken(t *testing.T) {
    // Setup test database
    DB = setupTestDB()

    // Setup Gin
    gin.SetMode(gin.TestMode)
    router := gin.New()
    router.POST("/register", RegisterHandler)

    // Create registration request
    requestBody := map[string]interface{}{
        "email":    "tokentest@example.com",
        "password": "SecurePass123!",
        "username": "tokenuser",
    }

    body, _ := json.Marshal(requestBody)
    req := httptest.NewRequest("POST", "/register", bytes.NewBuffer(body))
    req.Header.Set("Content-Type", "application/json")

    // Record response
    w := httptest.NewRecorder()
    router.ServeHTTP(w, req)

    // Assert successful registration
    assert.Equal(t, 201, w.Code)

    // Parse response
    var response map[string]interface{}
    json.Unmarshal(w.Body.Bytes(), &response)

    // Verify token is returned
    assert.NotNil(t, response["token"])
    assert.NotEmpty(t, response["token"])

    // Verify token is valid by validating it
    tokenString := response["token"].(string)
    userID, err := utils.ValidateJWT(tokenString)
    assert.NoError(t, err)
    assert.Greater(t, userID, uint(0))
}