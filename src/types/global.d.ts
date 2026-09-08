import { SocketService } from '../services/socket.service';

declare global {
  var socketService: SocketService;
}

export {};
