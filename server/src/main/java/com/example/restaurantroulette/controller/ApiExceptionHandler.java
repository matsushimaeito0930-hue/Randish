package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.ErrorResponse;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.ConflictException;
import com.example.restaurantroulette.exception.NotFoundException;
import com.example.restaurantroulette.exception.UnauthorizedException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiExceptionHandler {
  private static final Logger LOGGER = LoggerFactory.getLogger(ApiExceptionHandler.class);
  private static final String INTERNAL_ERROR_MESSAGE = "An unexpected server error occurred.";

  @ExceptionHandler(BadRequestException.class)
  public ResponseEntity<ErrorResponse> handleBadRequest(BadRequestException exception) {
    return ResponseEntity.badRequest().body(new ErrorResponse("BAD_REQUEST", exception.getMessage(), List.of()));
  }

  @ExceptionHandler(MissingServletRequestParameterException.class)
  public ResponseEntity<ErrorResponse> handleMissingParam(MissingServletRequestParameterException exception) {
    return ResponseEntity.badRequest().body(new ErrorResponse("BAD_REQUEST", exception.getMessage(), List.of()));
  }

  @ExceptionHandler(NotFoundException.class)
  public ResponseEntity<ErrorResponse> handleNotFound(NotFoundException exception) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("NOT_FOUND", exception.getMessage(), List.of()));
  }

  @ExceptionHandler(ConflictException.class)
  public ResponseEntity<ErrorResponse> handleConflict(ConflictException exception) {
    return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("CONFLICT", exception.getMessage(), List.of()));
  }

  @ExceptionHandler(UnauthorizedException.class)
  public ResponseEntity<ErrorResponse> handleUnauthorized(UnauthorizedException exception) {
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("UNAUTHORIZED", exception.getMessage(), List.of()));
  }

  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<ErrorResponse> handleNoResource(NoResourceFoundException exception) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(new ErrorResponse("NOT_FOUND", "Resource not found.", List.of()));
  }

  @ExceptionHandler(ResponseStatusException.class)
  public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException exception) {
    HttpStatus status = HttpStatus.resolve(exception.getStatusCode().value());
    HttpStatus resolvedStatus = status == null ? HttpStatus.INTERNAL_SERVER_ERROR : status;
    String code = resolvedStatus.name();
    String message = exception.getReason() == null || exception.getReason().isBlank()
        ? resolvedStatus.getReasonPhrase()
        : exception.getReason();
    return ResponseEntity.status(resolvedStatus)
        .body(new ErrorResponse(code, message, List.of()));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ErrorResponse> handleUnexpected(Exception exception) {
    LOGGER.error("Unexpected API error", exception);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(new ErrorResponse("INTERNAL_SERVER_ERROR", INTERNAL_ERROR_MESSAGE, List.of()));
  }
}
