package com.example.restaurantroulette.service;

import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.UnauthorizedException;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.LocalDate;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class ValidationService {
  public static final String GUEST_USER_ID = "guest";

  private static final int MAX_ID_LENGTH = 120;
  private static final int MAX_PROVIDER_LENGTH = 80;
  private static final int MAX_PROVIDER_PLACE_ID_LENGTH = 255;
  private static final int MAX_TEXT_LENGTH = 120;
  private static final int MAX_NOTE_LENGTH = 1000;
  private static final int MAX_BUDGET = 1_000_000;
  private static final int MIN_NEARBY_RADIUS_METERS = 100;
  private static final int MAX_NEARBY_RADIUS_METERS = 5_000;
  private static final Pattern SAFE_ID = Pattern.compile("[A-Za-z0-9._:@-]{1,120}");
  private static final Pattern SAFE_PROVIDER = Pattern.compile("[A-Za-z0-9_-]{1,80}");

  public String requireUserId(String userId) {
    String cleanUserId = requireIdentifier("userId", userId, MAX_ID_LENGTH);
    if (!SAFE_ID.matcher(cleanUserId).matches()) {
      throw new BadRequestException("userId format is invalid.");
    }
    return cleanUserId;
  }

  public String requirePersistentUserId(String userId) {
    String cleanUserId = requireUserId(userId);
    if (isGuestUserId(cleanUserId)) {
      throw new UnauthorizedException("Guest users cannot access persisted user data.");
    }
    return cleanUserId;
  }

  public boolean isGuestUserId(String userId) {
    return GUEST_USER_ID.equals(userId == null ? null : userId.trim());
  }

  public String requireRestaurantId(String restaurantId) {
    String cleanRestaurantId = requireIdentifier("restaurantId", restaurantId, MAX_ID_LENGTH);
    if (!SAFE_ID.matcher(cleanRestaurantId).matches()) {
      throw new BadRequestException("restaurantId format is invalid.");
    }
    return cleanRestaurantId;
  }

  public String optionalProvider(String provider) {
    String cleanProvider = cleanOptionalText("provider", provider, MAX_PROVIDER_LENGTH);
    if (cleanProvider != null && !SAFE_PROVIDER.matcher(cleanProvider).matches()) {
      throw new BadRequestException("provider format is invalid.");
    }
    return cleanProvider;
  }

  public String optionalProviderPlaceId(String providerPlaceId) {
    return cleanOptionalText("providerPlaceId", providerPlaceId, MAX_PROVIDER_PLACE_ID_LENGTH);
  }

  public String optionalSearchText(String name, String value) {
    return cleanOptionalText(name, value, MAX_TEXT_LENGTH);
  }

  public String optionalNote(String name, String value) {
    return cleanOptionalText(name, value, MAX_NOTE_LENGTH);
  }

  public String optionalPhotoUrl(String photoUrl) {
    String cleanPhotoUrl = cleanOptionalText("photoUrl", photoUrl, MAX_NOTE_LENGTH);
    if (cleanPhotoUrl == null) {
      return null;
    }
    try {
      URI uri = new URI(cleanPhotoUrl);
      String scheme = uri.getScheme();
      if (scheme == null || (!scheme.equalsIgnoreCase("https") && !scheme.equalsIgnoreCase("http"))) {
        throw new BadRequestException("photoUrl must be an http or https URL.");
      }
      if (uri.getHost() == null || uri.getHost().isBlank()) {
        throw new BadRequestException("photoUrl host is required.");
      }
      return cleanPhotoUrl;
    } catch (URISyntaxException exception) {
      throw new BadRequestException("photoUrl format is invalid.");
    }
  }

  public void validateBudget(Integer budgetMin, Integer budgetMax) {
    if (budgetMin != null && (budgetMin < 0 || budgetMin > MAX_BUDGET)) {
      throw new BadRequestException("budgetMin is out of range.");
    }
    if (budgetMax != null && (budgetMax < 0 || budgetMax > MAX_BUDGET)) {
      throw new BadRequestException("budgetMax is out of range.");
    }
    if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
      throw new BadRequestException("budgetMin must be less than or equal to budgetMax.");
    }
  }

  public Integer optionalPositiveInteger(String name, Integer value) {
    if (value == null) {
      return null;
    }
    if (value <= 0) {
      throw new BadRequestException(name + " must be positive.");
    }
    return value;
  }

  public void validateSearchRequest(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range) {
    optionalSearchText("area", area);
    optionalSearchText("genre", genre);
    validateBudget(budgetMin, budgetMax);
    validateCoordinates(latitude, longitude, range);
  }

  public void validateNearbyPlacesRequest(
      Double latitude,
      Double longitude,
      Integer radius,
      String category,
      String priceRange) {
    validateCoordinates(latitude, longitude, null);
    if (latitude == null || longitude == null) {
      throw new BadRequestException("latitude and longitude are required.");
    }
    if (radius != null && (radius < MIN_NEARBY_RADIUS_METERS || radius > MAX_NEARBY_RADIUS_METERS)) {
      throw new BadRequestException("radius must be between 100 and 5000 meters.");
    }
    optionalSearchText("category", category);
    optionalSearchText("priceRange", priceRange);
  }

  public void validateCoordinates(Double latitude, Double longitude, Integer range) {
    if ((latitude == null) != (longitude == null)) {
      throw new BadRequestException("latitude and longitude must be provided together.");
    }
    if (latitude != null && (latitude < -90 || latitude > 90)) {
      throw new BadRequestException("latitude is out of range.");
    }
    if (longitude != null && (longitude < -180 || longitude > 180)) {
      throw new BadRequestException("longitude is out of range.");
    }
    if (range != null && (range < 1 || range > 5)) {
      throw new BadRequestException("range must be between 1 and 5.");
    }
  }

  public int validateRating(Integer rating) {
    int cleanRating = rating == null ? 0 : rating;
    if (cleanRating < 0 || cleanRating > 5) {
      throw new BadRequestException("rating must be between 0 and 5.");
    }
    return cleanRating;
  }

  public LocalDate validateVisitDate(LocalDate visitDate) {
    LocalDate cleanVisitDate = visitDate == null ? LocalDate.now() : visitDate;
    if (cleanVisitDate.isAfter(LocalDate.now().plusDays(1))) {
      throw new BadRequestException("visitDate cannot be in the future.");
    }
    return cleanVisitDate;
  }

  public String cleanOptionalText(String name, String value, int maxLength) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    if (trimmed.isEmpty()) {
      return null;
    }
    validateText(name, trimmed, maxLength);
    return trimmed;
  }

  private String requireIdentifier(String name, String value, int maxLength) {
    if (value == null || value.isBlank()) {
      throw new BadRequestException(name + " is required.");
    }
    String trimmed = value.trim();
    validateText(name, trimmed, maxLength);
    return trimmed;
  }

  private void validateText(String name, String value, int maxLength) {
    if (value.length() > maxLength) {
      throw new BadRequestException(name + " is too long.");
    }
    if (value.chars().anyMatch(Character::isISOControl)) {
      throw new BadRequestException(name + " contains invalid characters.");
    }
  }
}
