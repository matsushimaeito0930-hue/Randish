package com.example.restaurantroulette.service;

import com.example.restaurantroulette.exception.UnauthorizedException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Service;

@Service
public class PasswordHashService {
  private static final SecureRandom SECURE_RANDOM = new SecureRandom();
  private static final int PASSWORD_HASH_ITERATIONS = 120_000;
  private static final int PASSWORD_HASH_BITS = 256;

  public PasswordSecret hash(String password) {
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

  public boolean matches(String password, String expectedHash, String salt) {
    byte[] saltBytes;
    byte[] expectedHashBytes;
    try {
      saltBytes = Base64.getDecoder().decode(salt);
      expectedHashBytes = Base64.getDecoder().decode(expectedHash);
    } catch (IllegalArgumentException exception) {
      throw new UnauthorizedException("Email or password is incorrect.");
    }

    PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), saltBytes, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_BITS);
    try {
      SecretKeyFactory keyFactory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
      byte[] actualHashBytes = keyFactory.generateSecret(spec).getEncoded();
      return MessageDigest.isEqual(expectedHashBytes, actualHashBytes);
    } catch (NoSuchAlgorithmException | InvalidKeySpecException exception) {
      throw new IllegalStateException("PBKDF2WithHmacSHA256 is not available.", exception);
    } finally {
      spec.clearPassword();
    }
  }

  public record PasswordSecret(String hash, String salt) {
  }
}
