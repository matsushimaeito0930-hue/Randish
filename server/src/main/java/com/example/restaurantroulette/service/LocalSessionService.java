package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.UserResponse;
import com.example.restaurantroulette.exception.UnauthorizedException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class LocalSessionService {
  private static final Duration SESSION_TTL = Duration.ofDays(30);
  private static final SecureRandom SECURE_RANDOM = new SecureRandom();

  private final Map<String, LocalSession> sessions = new ConcurrentHashMap<>();

  public String createSession(UserResponse user) {
    byte[] tokenBytes = new byte[32];
    SECURE_RANDOM.nextBytes(tokenBytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    sessions.put(token, new LocalSession(user.id(), Instant.now().plus(SESSION_TTL)));
    return token;
  }

  public String authenticate(String authorizationHeader) {
    String token = stripBearerToken(authorizationHeader);
    LocalSession session = sessions.get(token);
    if (session == null || session.expiresAt().isBefore(Instant.now())) {
      if (session != null) {
        sessions.remove(token);
      }
      throw new UnauthorizedException("Session is invalid or expired.");
    }
    return session.userId();
  }

  private String stripBearerToken(String value) {
    if (value == null || value.isBlank()) {
      throw new UnauthorizedException("Authorization bearer token is required.");
    }
    return value.replaceFirst("(?i)^Bearer\\s+", "").trim();
  }

  private record LocalSession(String userId, Instant expiresAt) {
  }
}
