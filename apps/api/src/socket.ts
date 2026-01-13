import { Server as IOServer } from "socket.io";
import { Server as HttpServer } from "http";

let io: IOServer | null = null;

export function initSocket(server: HttpServer) {
  if (io) return io;

  const origins = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(",").map((s) => s.trim())
    : ["http://localhost:5175"];

  io = new IOServer(server, {
    cors: {
      origin: origins,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    console.log("[socket.io] client connected:", socket.id);
    socket.on("disconnect", () => {
      // console.log('[socket.io] client disconnected', socket.id);
    });
  });

  return io;
}

export function getIo() {
  return io;
}
