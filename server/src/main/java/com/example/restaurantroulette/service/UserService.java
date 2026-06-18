package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.UserCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserResponse;
import com.example.restaurantroulette.entity.AppUser;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.ConflictException;
import com.example.restaurantroulette.exception.NotFoundException;
import com.example.restaurantroulette.exception.UnauthorizedException;
import com.example.restaurantroulette.repository.AppUserRepository;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class UserService {
  private static final Pattern EMAIL_PATTERN = Pattern.compile(
      "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$",
      Pattern.CASE_INSENSITIVE);

  private final AppUserRepository userRepository;
  private final DtoMapper mapper;
  private final PasswordHashService passwordHashService;

  public UserService(AppUserRepository userRepository, DtoMapper mapper, PasswordHashService passwordHashService) {
    this.userRepository = userRepository;
    this.mapper = mapper;
    this.passwordHashService = passwordHashService;
  }

  public UserResponse register(UserCreateRequest request) {
    String email = normalizeEmail(request.email());
    String displayName = normalizeDisplayName(request.displayName(), email);
    validatePassword(request.password());

    userRepository.findByEmail(email).ifPresent(existing -> {
      throw new ConflictException("Email is already registered.");
    });

    PasswordHashService.PasswordSecret secret = passwordHashService.hash(request.password());
    return registerVerifiedEmail(email, displayName, secret.hash(), secret.salt());
  }

  public UserResponse findById(String id) {
    return userRepository.findById(id)
        .map(mapper::toUserResponse)
        .orElseThrow(() -> new NotFoundException("User not found."));
  }

  public UserResponse authenticate(String email, String password) {
    String normalizedEmail = normalizeEmail(email);
    validatePassword(password);
    AppUserRepository.AppUserCredentials credentials = userRepository.findCredentialsByEmail(normalizedEmail)
        .orElseThrow(() -> new UnauthorizedException("Email or password is incorrect."));
    if (!"EMAIL".equalsIgnoreCase(credentials.user().authProvider())) {
      throw new UnauthorizedException("Please use the social login used for this account.");
    }
    if (credentials.passwordHash() == null || credentials.passwordSalt() == null) {
      throw new UnauthorizedException("Email or password is incorrect.");
    }
    if (!passwordHashService.matches(password, credentials.passwordHash(), credentials.passwordSalt())) {
      throw new UnauthorizedException("Email or password is incorrect.");
    }
    return mapper.toUserResponse(credentials.user());
  }

  public UserResponse registerVerifiedEmail(String email, String displayName, String passwordHash, String passwordSalt) {
    String normalizedEmail = normalizeEmail(email);
    String normalizedDisplayName = normalizeDisplayName(displayName, normalizedEmail);
    if (passwordHash == null || passwordHash.isBlank() || passwordSalt == null || passwordSalt.isBlank()) {
      throw new BadRequestException("password secret is required.");
    }
    userRepository.findByEmail(normalizedEmail).ifPresent(existing -> {
      throw new ConflictException("Email is already registered.");
    });

    Instant now = Instant.now();
    AppUser user = new AppUser(UUID.randomUUID().toString(), normalizedEmail, normalizedDisplayName, "EMAIL", now, now);
    return mapper.toUserResponse(userRepository.save(user, passwordHash, passwordSalt));
  }

  public boolean emailExists(String email) {
    return userRepository.findByEmail(normalizeEmail(email)).isPresent();
  }

  public UserResponse syncSupabaseUser(SupabaseAuthService.SupabaseAuthUser authUser, String fallbackDisplayName) {
    String userId = authUser.id();
    if (userId == null || userId.isBlank()) {
      throw new BadRequestException("Supabase user id is required.");
    }

    String email = normalizeEmail(authUser.email());
    String displayName = normalizeDisplayName(resolveDisplayName(authUser, fallbackDisplayName, email), email);
    Instant now = Instant.now();
    AppUser user = new AppUser(userId, email, displayName, "SUPABASE", now, now);
    return mapper.toUserResponse(userRepository.upsertExternalUser(user));
  }

  private String resolveDisplayName(SupabaseAuthService.SupabaseAuthUser authUser, String fallbackDisplayName, String email) {
    String metadataName = authUser.displayName();
    if (metadataName != null && !metadataName.isBlank()) {
      return metadataName;
    }
    if (fallbackDisplayName != null && !fallbackDisplayName.isBlank()) {
      return fallbackDisplayName;
    }
    return email.substring(0, email.indexOf('@'));
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

}
