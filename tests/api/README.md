# API Testing Collections

Manual API testing files for WeWatch backend.

## 📁 Directory Structure

```
tests/api/
├── auth.http           # Authentication endpoints
├── payment.http        # Payment and wallet endpoints
├── events.http         # Event creation and management
├── tickets.http        # Ticketing endpoints
├── sessions.http       # Watch session endpoints
└── postman/           # Postman collection exports
    └── WeWatch.postman_collection.json
```

## 🔌 REST Client (.http files)

**VS Code Extension:** [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)

### Usage

1. Install REST Client extension in VS Code
2. Open any `.http` file
3. Click "Send Request" above each request

### Example: `auth.http`

```http
### Variables
@baseUrl = http://localhost:8080/api
@email = test@example.com
@password = SecurePass123!

### Register User
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "email": "{{email}}",
  "password": "{{password}}",
  "username": "testuser"
}

### Login
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "{{email}}",
  "password": "{{password}}"
}

### Get Current User (requires auth token)
GET {{baseUrl}}/auth/me
Authorization: Bearer YOUR_TOKEN_HERE
```

## 📮 Postman Collections

Import `postman/WeWatch.postman_collection.json` into Postman for full API testing suite.

**Features:**
- Environment variables (dev, staging, prod)
- Pre-request scripts
- Test assertions
- Authentication handling

## 🚀 Quick Test Scripts

**File:** `tests/api/quick_test.sh`

```bash
#!/bin/bash
BASE_URL="http://localhost:8080/api"

# Test health endpoint
curl -X GET $BASE_URL/health

# Test registration
curl -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!","username":"testuser"}'

# Test login
curl -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!"}'
```

**Run:**
```bash
chmod +x tests/api/quick_test.sh
./tests/api/quick_test.sh
```

## ✅ Testing Checklist

- [ ] Auth endpoints (register, login, refresh)
- [ ] Payment endpoints (purchase, withdraw)
- [ ] Event endpoints (create, list, update, delete)
- [ ] Ticket endpoints (RSVP, purchase, cancel)
- [ ] Session endpoints (create, join, leave)
- [ ] WebSocket connection

## 📊 Expected Responses

### Success Response (200)
```json
{
  "status": "success",
  "data": { ... }
}
```

### Error Response (400/401/403/500)
```json
{
  "error": "Error message here"
}
```

## 🔐 Authentication

Most endpoints require JWT token in header:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Get token from login response, then add to subsequent requests.
