package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.PremiumStatusResponse;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.repository.PremiumRepository;
import java.time.Instant;
import org.springframework.stereotype.Service;

@Service
public class PremiumService {
  public static final String PREMIUM_ENTITLEMENT_KEY = "premium";
  /**
   * 開発者向けの全権限。Premium とは別の権利として発行する。
   * Premium は「月1回レポートが届く」体験そのものが商品なので、
   * 検証のために回数制限を外すと Premium の確認にならない。だから権限を分ける。
   */
  public static final String DEV_ENTITLEMENT_KEY = "dev";

  private final PremiumRepository premiumRepository;

  public PremiumService(PremiumRepository premiumRepository) {
    this.premiumRepository = premiumRepository;
  }

  public PremiumStatusResponse status(String userId) {
    String normalizedUserId = normalizeUserId(userId);
    if (ValidationService.GUEST_USER_ID.equals(normalizedUserId)) {
      return freeStatus(false);
    }

    boolean dev = isDeveloper(normalizedUserId);
    return premiumRepository.findActiveEntitlement(normalizedUserId, PREMIUM_ENTITLEMENT_KEY, Instant.now())
        .map(entitlement -> new PremiumStatusResponse(
            true,
            entitlement.entitlementKey(),
            entitlement.source(),
            entitlement.activeUntil(),
            entitlement.provider(),
            entitlement.environment(),
            dev))
        .orElseGet(() -> dev
            // dev は Premium 機能もすべて使えるようにする（Premium の上位互換）
            ? new PremiumStatusResponse(true, PREMIUM_ENTITLEMENT_KEY, "DEV", null, null, null, true)
            : freeStatus(false));
  }

  /** premium_grants に有効な entitlement_key='dev' があるかどうか。 */
  public boolean isDeveloper(String userId) {
    String normalizedUserId = normalizeUserId(userId);
    if (ValidationService.GUEST_USER_ID.equals(normalizedUserId)) {
      return false;
    }
    return premiumRepository
        .findActiveEntitlement(normalizedUserId, DEV_ENTITLEMENT_KEY, Instant.now())
        .isPresent();
  }

  private PremiumStatusResponse freeStatus(boolean dev) {
    return new PremiumStatusResponse(false, PREMIUM_ENTITLEMENT_KEY, "FREE", null, null, null, dev);
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
