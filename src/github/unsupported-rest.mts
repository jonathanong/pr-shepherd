import { EXIT, ShepherdError } from "../exit-codes.mts";

export class UnsupportedRestOperationError extends ShepherdError {
  constructor(operation: string, reason = "no supported REST endpoint is available") {
    super(`${operation} is unsupported in REST transport: ${reason}`, EXIT.UNAVAILABLE);
    this.name = "UnsupportedRestOperationError";
  }
}
