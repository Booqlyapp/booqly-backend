export class SubscriptionError extends Error {
  public statusCode: number;
  
  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = 'SubscriptionError';
    this.statusCode = statusCode;
  }
}

export class ValidationError extends Error {
  public statusCode: number;
  
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
  }
}
