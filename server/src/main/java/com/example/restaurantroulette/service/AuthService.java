package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.AuthResponse;
import com.example.restaurantroulette.dto.ApiDtos.OAuthAuthorizeResponse;
import com.example.restaurantroulette.dto.ApiDtos.OAuthSessionRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserLoginRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserResponse;
import com.example.restaurantroulette.exception.BadRequestException;
import java.util.Locale;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
  private final UserService userService;
  private final SupabaseAuthService supabaseAuthService;

  public AuthService(UserService userService, SupabaseAuthService supabaseAuthService) {
    this.userService = userService;
    this.supabaseAuthService = supabaseAuthService;
  }

  public AuthResponse register(UserCreateRequest request) {
    if (!supabaseAuthService.isConfigured()) {
      return new AuthResponse(userService.register(request), null);
    }

    String email = normalizeEmail(request.email());
    String displayName = normalizeDisplayName(request.displayName(), email);
    validatePassword(request.password());

    SupabaseAuthService.SupabaseAuthResult authResult = supabaseAuthService.signUp(email, request.password(), displayName);
    UserResponse user = userService.syncSupabaseUser(authResult.user(), displayName);
    return new AuthResponse(user, authResult.accessToken());
  }

  public AuthResponse login(UserLoginRequest request) {
    if (!supabaseAuthService.isConfigured()) {
      return new AuthResponse(userService.authenticate(request.email(), request.password()), null);
    }

    String email = normalizeEmail(request.email());
    validatePassword(request.password());

    SupabaseAuthService.SupabaseAuthResult authResult = supabaseAuthService.signInWithPassword(email, request.password());
    UserResponse user = userService.syncSupabaseUser(authResult.user(), null);
    return new AuthResponse(user, authResult.accessToken());
  }

  public OAuthAuthorizeResponse createOAuthAuthorizeUrl(String provider, String redirectTo) {
    String authorizationUrl = supabaseAuthService.createOAuthAuthorizeUrl(provider, redirectTo);
    return new OAuthAuthorizeResponse(provider.trim().toLowerCase(Locale.ROOT), authorizationUrl, redirectTo);
  }

  public AuthResponse loginWithOAuthSession(OAuthSessionRequest request) {
    if (request == null || request.accessToken() == null || request.accessToken().isBlank()) {
      throw new BadRequestException("accessToken is required.");
    }
    String accessToken = request.accessToken().trim();
    SupabaseAuthService.SupabaseAuthUser authUser = supabaseAuthService.getUser("Bearer " + accessToken);
    UserResponse user = userService.syncSupabaseUser(authUser, null);
    return new AuthResponse(user, accessToken);
  }

  public AuthResponse me(String authorizationHeader) {
    SupabaseAuthService.SupabaseAuthUser authUser = supabaseAuthService.getUser(authorizationHeader);
    UserResponse user = userService.syncSupabaseUser(authUser, null);
    return new AuthResponse(user, null);
  }

  private String normalizeEmail(String email) {
    if (email == null || email.isBlank()) {
      throw new BadRequestException("email is required.");
    }
    String normalized = email.trim().toLowerCase(Locale.ROOT);
    if (!normalized.contains("@") || normalized.startsWith("@") || normalized.endsWith("@")) {
      throw new BadRequestException("email format is invalid.");
    }
    return normalized;
  }

  private String normalizeDisplayName(String displayName, String email) {
    String normalized = displayName == null || displayName.isBlank()
        ? email.substring(0, email.indexOf('@'))
        : displayName.trim();
    if (normalized.length() > 120) {
      throw new BadRequestException("displayName must be 120 characters or less.");
    }
    return normalized;
  }

  private void validatePassword(String password) {
    if (password == null || password.length() < 8) {
      throw new BadRequestException("password must be at least 8 characters.");
    }
  }
}
