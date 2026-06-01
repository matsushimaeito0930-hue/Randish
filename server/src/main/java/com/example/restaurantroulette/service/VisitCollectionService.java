package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.VisitCheckResponse;
import com.example.restaurantroulette.dto.ApiDtos.VisitCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.VisitResponse;
import com.example.restaurantroulette.entity.VisitCollection;
import com.example.restaurantroulette.repository.VisitCollectionRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class VisitCollectionService {
  private final VisitCollectionRepository visitRepository;
  private final RestaurantQueryService restaurantQueryService;
  private final StampService stampService;
  private final DtoMapper mapper;
  private final ValidationService validationService;

  public VisitCollectionService(
      VisitCollectionRepository visitRepository,
      RestaurantQueryService restaurantQueryService,
      StampService stampService,
      DtoMapper mapper,
      ValidationService validationService) {
    this.visitRepository = visitRepository;
    this.restaurantQueryService = restaurantQueryService;
    this.stampService = stampService;
    this.mapper = mapper;
    this.validationService = validationService;
  }

  public VisitResponse create(VisitCreateRequest request) {
    validationService.requireUserId(request.userId());
    validationService.requireRestaurantId(request.restaurantId());
    var restaurant = restaurantQueryService.getEntityOrThrow(request.restaurantId());
    boolean alreadyVisited = visitRepository.existsByUserIdAndRestaurantId(request.userId(), request.restaurantId());
    VisitCollection visit = new VisitCollection(
        UUID.randomUUID().toString(),
        request.userId(),
        request.restaurantId(),
        request.visitDate() == null ? LocalDate.now() : request.visitDate(),
        request.photoUrl(),
        request.memo(),
        request.rating() == null ? 0 : request.rating(),
        Instant.now());
    VisitCollection saved = visitRepository.save(visit);
    stampService.awardFirstVisitIfNeeded(request.userId(), request.restaurantId(), alreadyVisited);
    return mapper.toVisitResponse(saved, restaurant);
  }

  public List<VisitResponse> findByUserId(String userId) {
    validationService.requireUserId(userId);
    return visitRepository.findByUserId(userId).stream()
        .map(visit -> mapper.toVisitResponse(visit, restaurantQueryService.getEntityOrThrow(visit.restaurantId())))
        .toList();
  }

  public VisitCheckResponse check(String userId, String restaurantId) {
    validationService.requireUserId(userId);
    validationService.requireRestaurantId(restaurantId);
    restaurantQueryService.getEntityOrThrow(restaurantId);
    return new VisitCheckResponse(visitRepository.existsByUserIdAndRestaurantId(userId, restaurantId));
  }

  public List<VisitCollection> findEntitiesByUserId(String userId) {
    validationService.requireUserId(userId);
    return visitRepository.findByUserId(userId);
  }
}
