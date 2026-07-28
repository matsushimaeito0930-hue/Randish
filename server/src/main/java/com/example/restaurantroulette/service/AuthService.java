package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.AuthResponse;
import com.example.restaurantroulette.dto.ApiDtos.EmailVerificationResponse;
import com.example.restaurantroulette.dto.ApiDtos.EmailOtpVerifyRequest;
import com.example.restaurantroulette.dto.ApiDtos.OAuthRefreshRequest;
import com.example.restaurantroulette.dto.ApiDtos.OAuthSessionRequest;
import com.example.restaurantroulette.dto.ApiDtos.PasswordResetConfirmRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserLoginRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserResponse;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.UnauthorizedException;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.IntStream;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
  private static final Pattern EMAIL_PATTERN = Pattern.compile(
      "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$",
      Pattern.CASE_INSENSITIVE);
  private static final Duration MAGIC_LINK_DEDUPLICATION_WINDOW = Duration.ofSeconds(60);
  private static final Duration EMAIL_OTP_RESPONSE_TTL = Duration.ofMinutes(10);
  private static final int MAGIC_LINK_CACHE_CLEANUP_THRESHOLD = 512;
  private static final int MAGIC_LINK_LOCK_STRIPES = 64;

  private final UserService userService;
  private final SupabaseAuthService supabaseAuthService;
  private final LocalSessionService localSessionService;
  private final Object[] magicLinkRequestLocks = IntStream.range(0, MAGIC_LINK_LOCK_STRIPES)
      .mapToObj(ignored -> new Object())
      .toArray(Object[]::new);
  private final ConcurrentMap<String, MagicLinkDispatch> recentMagicLinkDispatches = new ConcurrentHashMap<>();

  public AuthService(
      UserService userService,
      SupabaseAuthService supabaseAuthService,
      LocalSessionService localSessionService) {
    this.userService = userService;
    this.supabaseAuthService = supabaseAuthService;
    this.localSessionService = localSessionService;
  }

  public AuthResponse register(UserCreateRequest request) {
    if (!supabaseAuthService.isConfigured()) {
      UserResponse user = userService.register(request);
      return new AuthResponse(user, localSessionService.createSession(user));
    }

    String email = normalizeEmail(request.email());
    String displayName = normalizeDisplayName(request.displayName(), email);
    validatePassword(request.password());

    SupabaseAuthService.SupabaseAuthResult authResult = supabaseAuthService.signUp(email, request.password(), displayName);
    UserResponse user = userService.syncSupabaseUser(authResult.user(), displayName);
    return new AuthResponse(user, authResult.accessToken(), authResult.refreshToken());
  }

  public AuthResponse login(UserLoginRequest request) {
    String email = normalizeEmail(request.email());
    requirePassword(request.password());

    try {
      UserResponse user = userService.authenticate(email, request.password());
      return new AuthResponse(user, localSessionService.createSession(user));
    } catch (UnauthorizedException localException) {
      if (!supabaseAuthService.isConfigured()) {
        throw localException;
      }
      try {
        SupabaseAuthService.SupabaseAuthResult authResult = supabaseAuthService.signInWithPassword(email, request.password());
        UserResponse user = userService.syncSupabaseUser(authResult.user(), null);
        return new AuthResponse(user, authResult.accessToken(), authResult.refreshToken());
      } catch (UnauthorizedException ignored) {
        throw localException;
      }
    }
  }

  public EmailVerificationResponse requestMagicLink(String email, String redirectTo, boolean createUser) {
    String normalizedEmail = normalizeEmail(email);
    String requestKey = normalizedEmail + "\u0000" + createUser;

    Object requestLock = magicLinkRequestLocks[Math.floorMod(requestKey.hashCode(), magicLinkRequestLocks.length)];
    synchronized (requestLock) {
      Instant requestedAt = Instant.now();
      MagicLinkDispatch recentDispatch = recentMagicLinkDispatches.get(requestKey);
      if (recentDispatch != null
          && requestedAt.isBefore(recentDispatch.requestedAt().plus(MAGIC_LINK_DEDUPLICATION_WINDOW))) {
        return recentDispatch.response();
      }

      Instant expiresAt;
      try {
        expiresAt = supabaseAuthService.requestMagicLink(normalizedEmail, redirectTo, createUser);
      } catch (BadRequestException exception) {
        if (createUser || !isMissingAccountOtpError(exception)) {
          throw exception;
        }
        // Keep login responses indistinguishable for registered and unregistered addresses.
        // No OTP is sent for a missing account, so knowledge of an email address alone
        // cannot be used to discover whether that address has a RANDISH account.
        expiresAt = requestedAt.plus(EMAIL_OTP_RESPONSE_TTL);
      }
      EmailVerificationResponse response = new EmailVerificationResponse(normalizedEmail, expiresAt);
      recentMagicLinkDispatches.put(requestKey, new MagicLinkDispatch(response, requestedAt));
      cleanExpiredMagicLinkDispatches(requestedAt);
      return response;
    }
  }

  public AuthResponse verifyEmailOtp(EmailOtpVerifyRequest request) {
    if (request == null) {
      throw new BadRequestException("request body is required.");
    }
    String email = normalizeEmail(request.email());
    String token = request.token() == null ? "" : request.token().trim();
    if (!token.matches("\\d{6,10}")) {
      throw new BadRequestException("token must be a 6 to 10-digit code.");
    }
    SupabaseAuthService.SupabaseAuthResult authResult = supabaseAuthService.verifyEmailOtp(email, token);
    UserResponse user = userService.syncSupabaseUser(authResult.user(), null);
    return new AuthResponse(user, authResult.accessToken(), authResult.refreshToken());
  }

  public EmailVerificationResponse requestPasswordReset(String email, String redirectTo) {
    String normalizedEmail = normalizeEmail(email);
    Instant expiresAt = supabaseAuthService.requestPasswordReset(normalizedEmail, redirectTo);
    return new EmailVerificationResponse(normalizedEmail, expiresAt);
  }

  public AuthResponse confirmPasswordReset(PasswordResetConfirmRequest request) {
    if (request == null || request.accessToken() == null || request.accessToken().isBlank()) {
      throw new BadRequestException("accessToken is required.");
    }
    validatePassword(request.password());
    String accessToken = request.accessToken().trim();
    SupabaseAuthService.SupabaseAuthUser authUser = supabaseAuthService.updatePassword(accessToken, request.password());
    UserResponse user = userService.syncSupabaseUser(authUser, null);
    userService.updatePassword(user.id(), request.password());
    return new AuthResponse(user, accessToken);
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

  public AuthResponse refreshOAuthSession(OAuthRefreshRequest request) {
    if (request == null || request.refreshToken() == null || request.refreshToken().isBlank()) {
      throw new BadRequestException("refreshToken is required.");
    }
    SupabaseAuthService.SupabaseAuthResult authResult = supabaseAuthService.refreshSession(request.refreshToken().trim());
    UserResponse user = userService.syncSupabaseUser(authResult.user(), null);
    return new AuthResponse(user, authResult.accessToken(), authResult.refreshToken());
  }

  public AuthResponse me(String authorizationHeader) {
    try {
      String userId = localSessionService.authenticate(authorizationHeader);
      return new AuthResponse(userService.findById(userId), null);
    } catch (UnauthorizedException localException) {
      if (!supabaseAuthService.isConfigured()) {
        throw localException;
      }
    }
    SupabaseAuthService.SupabaseAuthUser authUser = supabaseAuthService.getUser(authorizationHeader);
    UserResponse user = userService.syncSupabaseUser(authUser, null);
    return new AuthResponse(user, null);
  }

  public void logout(String authorizationHeader) {
    localSessionService.revokeSession(authorizationHeader);
  }

  private String normalizeEmail(String email) {
    if (email == null || email.isBlank()) {
      throw new BadRequestException("email is required.");
    }
    String normalized = email.trim().toLowerCase(Locale.ROOT);
    if (!EMAIL_PATTERN.matcher(normalized).matches()) {
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

  private void requirePassword(String password) {
    if (password == null || password.isBlank()) {
      throw new BadRequestException("password is required.");
    }
  }

  private void cleanExpiredMagicLinkDispatches(Instant requestedAt) {
    if (recentMagicLinkDispatches.size() < MAGIC_LINK_CACHE_CLEANUP_THRESHOLD) {
      return;
    }
    Instant cutoff = requestedAt.minus(MAGIC_LINK_DEDUPLICATION_WINDOW);
    recentMagicLinkDispatches.entrySet().removeIf(entry -> !entry.getValue().requestedAt().isAfter(cutoff));
  }

  private boolean isMissingAccountOtpError(BadRequestException exception) {
    String message = exception.getMessage();
    if (message == null || message.isBlank()) {
      return false;
    }
    String normalized = message.toLowerCase(Locale.ROOT);
    return normalized.contains("signups not allowed for otp")
        || normalized.contains("user not found")
        || normalized.contains("email not found")
        || normalized.contains("not registered");
  }

  private record MagicLinkDispatch(EmailVerificationResponse response, Instant requestedAt) {}
}
