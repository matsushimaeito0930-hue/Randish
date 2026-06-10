package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.VisitCheckResponse;
import com.example.restaurantroulette.dto.ApiDtos.VisitCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.VisitResponse;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.VisitCollectionService;
import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@CrossOrigin
@RestController
@RequestMapping("/api/visits")
public class VisitCollectionController {
  private final VisitCollectionService visitCollectionService;
  private final AuthenticatedUserService authenticatedUserService;

  public VisitCollectionController(VisitCollectionService visitCollectionService, AuthenticatedUserService authenticatedUserService) {
    this.visitCollectionService = visitCollectionService;
    this.authenticatedUserService = authenticatedUserService;
  }

  @PostMapping
  public VisitResponse create(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestBody VisitCreateRequest request) {
    authenticatedUserService.requireSameUserOrGuest(authorizationHeader, request.userId());
    return visitCollectionService.create(request);
  }

  @GetMapping("/user/{userId}")
  public List<VisitResponse> findByUserId(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @PathVariable String userId) {
    authenticatedUserService.requireSameUserOrGuest(authorizationHeader, userId);
    return visitCollectionService.findByUserId(userId);
  }

  @GetMapping("/check")
  public VisitCheckResponse check(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestParam String userId,
      @RequestParam String restaurantId) {
    authenticatedUserService.requireSameUserOrGuest(authorizationHeader, userId);
    return visitCollectionService.check(userId, restaurantId);
  }
}
