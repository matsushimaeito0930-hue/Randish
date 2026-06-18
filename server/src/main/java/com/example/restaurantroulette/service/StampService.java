package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.StampResponse;
import com.example.restaurantroulette.entity.Stamp;
import com.example.restaurantroulette.entity.StampType;
import com.example.restaurantroulette.repository.StampRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class StampService {
  private final StampRepository stampRepository;
  private final DtoMapper mapper;
  private final ValidationService validationService;

  public StampService(StampRepository stampRepository, DtoMapper mapper, ValidationService validationService) {
    this.stampRepository = stampRepository;
    this.mapper = mapper;
    this.validationService = validationService;
  }

  public void awardFirstVisitIfNeeded(String userId, String restaurantId, boolean alreadyVisited) {
    userId = validationService.requirePersistentUserId(userId);
    restaurantId = validationService.requireRestaurantId(restaurantId);
    if (alreadyVisited) {
      return;
    }
    if (stampRepository.existsByUserIdAndRestaurantIdAndStampType(userId, restaurantId, StampType.FIRST_VISIT)) {
      return;
    }
    stampRepository.save(new Stamp(UUID.randomUUID().toString(), userId, restaurantId, StampType.FIRST_VISIT, Instant.now()));
  }

  public List<StampResponse> findByUserId(String userId) {
    String cleanUserId = validationService.requirePersistentUserId(userId);
    return stampRepository.findByUserId(cleanUserId).stream()
        .map(mapper::toStampResponse)
        .toList();
  }
}
