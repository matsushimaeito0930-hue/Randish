package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.UserCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserResponse;
import com.example.restaurantroulette.entity.AppUser;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.ConflictException;
import com.example.restaurantroulette.exception.NotFoundException;
import com.example.restaurantroulette.repository.AppUserRepository;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Service;

@Service
public class UserService {
  private static final SecureRandom SECURE_RANDOM = new SecureRandom();
  private static final int PASSWORD_HASH_ITERATIONS = 120_000;
  private static final int PASSWORD_HASH_BITS = 256;

  private final AppUserRepository userRepository;
  private final DtoMapper mapper;

  public UserService(AppUserRepository userRepository, DtoMapper mapper) {
    this.userRepository = userRepository;
    this.mapper = mapper;
  }

  public UserResponse register(UserCreateRequest request) {
    String email = normalizeEmail(request.email());
    String displayName = normalizeDisplayName(request.displayName());
    validatePassword(request.password());

    userRepository.findByEmail(email).ifPresent(existing -> {
      throw new ConflictException("Email is already registered.");
    });

    PasswordSecret secret = hashPassword(request.password());
    Instant now = Instant.now();
    AppUser user = new AppUser(UUID.randomUUID().toString(), email, displayName, "EMAIL", now, now);
    return mapper.toUserResponse(userRepository.save(user, secret.hash(), secret.salt()));
  }

  public UserResponse findById(String id) {
    return userRepository.findById(id)
        .map(mapper::toUserResponse)
        .orElseThrow(() -> new NotFoundException("User not found."));
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

  private String normalizeDisplayName(String displayName) {
    if (displayName == null || displayName.isBlank()) {
      throw new BadRequestException("displayName is required.");
    }
    String normalized = displayName.trim();
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

  private PasswordSecret hashPassword(String password) {
    byte[] saltBytes = new byte[16];
    SECURE_RANDOM.nextBytes(saltBytes);
    PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), saltBytes, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_BITS);
    try {
      SecretKeyFactory keyFactory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
      byte[] hashBytes = keyFactory.generateSecret(spec).getEncoded();
      return new PasswordSecret(
          Base64.getEncoder().encodeToString(hashBytes),
          Base64.getEncoder().encodeToString(saltBytes));
    } catch (NoSuchAlgorithmException | InvalidKeySpecException exception) {
      throw new IllegalStateException("PBKDF2WithHmacSHA256 is not available.", exception);
    } finally {
      spec.clearPassword();
    }
  }

  private record PasswordSecret(String hash, String salt) {
  }
}
