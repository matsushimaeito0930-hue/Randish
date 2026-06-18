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
    String userId = validationService.requirePersistentUserId(request.userId());
    String restaurantId = validationService.requireRestaurantId(request.restaurantId());
    var restaurant = restaurantQueryService.getEntityOrThrow(restaurantId);
    boolean alreadyVisited = visitRepository.existsByUserIdAndRestaurantId(userId, restaurantId);
    VisitCollection visit = new VisitCollection(
        UUID.randomUUID().toString(),
        userId,
        restaurantId,
        validationService.validateVisitDate(request.visitDate()),
        validationService.optionalPhotoUrl(request.photoUrl()),
        validationService.optionalNote("memo", request.memo()),
        validationService.validateRating(request.rating()),
        Instant.now());
    VisitCollection saved = visitRepository.save(visit);
    stampService.awardFirstVisitIfNeeded(userId, restaurantId, alreadyVisited);
    return mapper.toVisitResponse(saved, restaurant);
  }

  public List<VisitResponse> findByUserId(String userId) {
    String cleanUserId = validationService.requirePersistentUserId(userId);
    return visitRepository.findByUserId(cleanUserId).stream()
        .map(visit -> mapper.toVisitResponse(visit, restaurantQueryService.getEntityOrThrow(visit.restaurantId())))
        .toList();
  }

  public VisitCheckResponse check(String userId, String restaurantId) {
    String cleanUserId = validationService.requirePersistentUserId(userId);
    String cleanRestaurantId = validationService.requireRestaurantId(restaurantId);
    restaurantQueryService.getEntityOrThrow(cleanRestaurantId);
    return new VisitCheckResponse(visitRepository.existsByUserIdAndRestaurantId(cleanUserId, cleanRestaurantId));
  }

  public List<VisitCollection> findEntitiesByUserId(String userId) {
    String cleanUserId = validationService.requirePersistentUserId(userId);
    return visitRepository.findByUserId(cleanUserId);
  }
}
