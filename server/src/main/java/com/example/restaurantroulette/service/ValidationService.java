package com.example.restaurantroulette.service;

import com.example.restaurantroulette.exception.BadRequestException;
import org.springframework.stereotype.Service;

@Service
public class ValidationService {
  public void requireUserId(String userId) {
    if (userId == null || userId.isBlank()) {
      throw new BadRequestException("userId is required.");
    }
  }

  public void requireRestaurantId(String restaurantId) {
    if (restaurantId == null || restaurantId.isBlank()) {
      throw new BadRequestException("restaurantId is required.");
    }
  }

  public void validateBudget(Integer budgetMin, Integer budgetMax) {
    if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
      throw new BadRequestException("budgetMin must be less than or equal to budgetMax.");
    }
  }
}
