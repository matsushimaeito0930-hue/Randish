package com.example.restaurantroulette.service;

import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.UnauthorizedException;
import org.springframework.stereotype.Service;

@Service
public class AuthenticatedUserService {
  private static final String GUEST_USER_ID = "guest";

  private final AuthService authService;

  public AuthenticatedUserService(AuthService authService) {
    this.authService = authService;
  }

  public void requireSameUser(String authorizationHeader, String requestedUserId) {
    String cleanRequestedUserId = cleanUserId(requestedUserId);
    String authenticatedUserId = authService.me(authorizationHeader).user().id();
    if (!authenticatedUserId.equals(cleanRequestedUserId)) {
      throw new UnauthorizedException("Authenticated user does not match request userId.");
    }
  }

  public void requireSameUserOrGuest(String authorizationHeader, String requestedUserId) {
    String cleanRequestedUserId = cleanUserId(requestedUserId);
    if (GUEST_USER_ID.equals(cleanRequestedUserId)) {
      return;
    }
    requireSameUser(authorizationHeader, cleanRequestedUserId);
  }

  private String cleanUserId(String userId) {
    if (userId == null || userId.isBlank()) {
      throw new BadRequestException("userId is required.");
    }
    return userId.trim();
  }
}
