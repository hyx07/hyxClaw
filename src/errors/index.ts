/**
 * Custom error types
 */

export class HyxClawError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "HyxClawError";
    Error.captureStackTrace?.(this, HyxClawError);
  }
}

export class ConfigError extends HyxClawError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFIG_ERROR", details);
    this.name = "ConfigError";
  }
}

export class LLMError extends HyxClawError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "LLM_ERROR", details);
    this.name = "LLMError";
  }
}

export class FileSystemError extends HyxClawError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "FS_ERROR", details);
    this.name = "FileSystemError";
  }
}

export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export function isHyxClawError(error: unknown): error is HyxClawError {
  return error instanceof HyxClawError;
}
