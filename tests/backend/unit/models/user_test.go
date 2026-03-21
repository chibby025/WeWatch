package models_test

import (
	"testing"
	"wewatch-backend/internal/models"
)

func TestUser_IsSuperAdmin(t *testing.T) {
	tests := []struct {
		name string
		role string
		want bool
	}{
		{
			name: "Super admin role",
			role: models.RoleSuperAdmin,
			want: true,
		},
		{
			name: "Admin role",
			role: models.RoleAdmin,
			want: false,
		},
		{
			name: "Regular user role",
			role: models.RoleUser,
			want: false,
		},
		{
			name: "Empty role",
			role: "",
			want: false,
		},
		{
			name: "Invalid role",
			role: "invalid_role",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			user := &models.User{
				Role: tt.role,
			}
			if got := user.IsSuperAdmin(); got != tt.want {
				t.Errorf("User.IsSuperAdmin() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestUser_IsAdmin(t *testing.T) {
	tests := []struct {
		name string
		role string
		want bool
	}{
		{
			name: "Super admin is admin",
			role: models.RoleSuperAdmin,
			want: true,
		},
		{
			name: "Admin role",
			role: models.RoleAdmin,
			want: true,
		},
		{
			name: "Regular user is not admin",
			role: models.RoleUser,
			want: false,
		},
		{
			name: "Empty role is not admin",
			role: "",
			want: false,
		},
		{
			name: "Invalid role is not admin",
			role: "moderator",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			user := &models.User{
				Role: tt.role,
			}
			if got := user.IsAdmin(); got != tt.want {
				t.Errorf("User.IsAdmin() = %v, want %v (role: %s)", got, tt.want, tt.role)
			}
		})
	}
}

func TestUserRoleConstants(t *testing.T) {
	// Verify role constants are set correctly
	if models.RoleUser != "user" {
		t.Errorf("RoleUser = %s, want 'user'", models.RoleUser)
	}
	if models.RoleAdmin != "admin" {
		t.Errorf("RoleAdmin = %s, want 'admin'", models.RoleAdmin)
	}
	if models.RoleSuperAdmin != "super_admin" {
		t.Errorf("RoleSuperAdmin = %s, want 'super_admin'", models.RoleSuperAdmin)
	}
}

func TestUser_DefaultValues(t *testing.T) {
	user := &models.User{
		Username: "testuser",
		Email:    "test@example.com",
	}

	// Test that user can be created with minimal fields
	if user.Username != "testuser" {
		t.Errorf("Username = %s, want 'testuser'", user.Username)
	}
	if user.Email != "test@example.com" {
		t.Errorf("Email = %s, want 'test@example.com'", user.Email)
	}

	// Role should be empty (will default in DB)
	if user.Role != "" {
		t.Errorf("Role should be empty initially, got %s", user.Role)
	}

	// Payment fields should be nil
	if user.Country != nil {
		t.Error("Country should be nil for new user")
	}
	if user.PreferredGateway != nil {
		t.Error("PreferredGateway should be nil for new user")
	}
}
