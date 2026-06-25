package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.PremiumStatusResponse;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.repository.PremiumRepository;
import java.time.Instant;
import org.springframework.stereotype.Service;

@Service
public class PremiumService {
  public static final String PREMIUM_ENTITLEMENT_KEY = "premium";

  private final PremiumRepository premiumRepository;

  public PremiumService(PremiumRepository premiumRepository) {
    this.premiumRepository = premiumRepository;
  }

  public PremiumStatusResponse status(String userId) {
    String normalizedUserId = normalizeUserId(userId);
    if (ValidationService.GUEST_USER_ID.equals(normalizedUserId)) {
      return freeStatus();
    }

    return premiumRepository.findActiveEntitlement(normalizedUserId, PREMIUM_ENTITLEMENT_KEY, Instant.now())
        .map(entitlement -> new PremiumStatusResponse(
            true,
            entitlement.entitlementKey(),
            entitlement.source(),
            entitlement.activeUntil(),
            entitlement.provider(),
            entitlement.environment()))
        .orElseGet(this::freeStatus);
  }

  private PremiumStatusResponse freeStatus() {
    return new PremiumStatusResponse(false, PREMIUM_ENTITLEMENT_KEY, "FREE", null, null, null);
  }

  private String normalizeUserId(String userId) {
    if (userId == null || userId.isBlank()) {
      throw new BadRequestException("userId is required.");
    }
    if (userId.length() > 120) {
      throw new BadRequestException("userId must be 120 characters or less.");
    }
    return userId.trim();
  }
}
