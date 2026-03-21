module wewatch-tests

go 1.24.0

// Replace directive points to your backend code
replace wewatch-backend => ../backend

require (
	wewatch-backend v0.0.0-00010101000000-000000000000
	github.com/gin-gonic/gin v1.10.1
	github.com/DATA-DOG/go-sqlmock v1.5.2
	github.com/stretchr/testify v1.10.0
	gorm.io/driver/postgres v1.6.0
	gorm.io/gorm v1.30.1
	github.com/golang-jwt/jwt/v5 v5.3.0
)
