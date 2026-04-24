import * as net from "net";
import * as os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import type { RobotInfo } from "./connection";

const execFileAsync = promisify(execFile);

const ROS1_PORT = 11311;
const ROS2_DDS_PORTS = [7400, 7401, 7402];
const SCAN_CONCURRENCY = 50;
const PORT_TIMEOUT_MS = 500;

export async function discoverRosHosts(
  onFound: (robot: RobotInfo) => void,
  timeoutMs = 3000
): Promise<RobotInfo[]> {
  const subnet = await getLocalSubnet();
  if (!subnet) return [];

  const ips = expandSubnet(subnet);
  const found: RobotInfo[] = [];

  // Scan in parallel batches
  for (let i = 0; i < ips.length; i += SCAN_CONCURRENCY) {
    const batch = ips.slice(i, i + SCAN_CONCURRENCY);
    const results = await Promise.all(batch.map((ip) => probeHost(ip)));
    for (const r of results) {
      if (r) {
        found.push(r);
        onFound(r);
      }
    }
    // Respect overall timeout
    if (Date.now() - start > timeoutMs) break;
  }

  return found;
}

let start = 0;

async function probeHost(ip: string): Promise<RobotInfo | null> {
  // Try ROS 1 first (port 11311)
  const ros1Open = await checkPort(ip, ROS1_PORT, PORT_TIMEOUT_MS);
  if (ros1Open) {
    const hostname = await resolveHostname(ip);
    return {
      ip,
      hostname,
      rosVersion: "ros1",
      masterPort: ROS1_PORT,
    };
  }

  // Try ROS 2 DDS ports
  for (const port of ROS2_DDS_PORTS) {
    const open = await checkPort(ip, port, PORT_TIMEOUT_MS);
    if (open) {
      const hostname = await resolveHostname(ip);
      return {
        ip,
        hostname,
        rosVersion: "ros2",
        domainId: 0,
      };
    }
  }

  return null;
}

function checkPort(ip: string, port: number, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;

    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(result);
    };

    sock.setTimeout(timeout);
    sock.connect(port, ip, () => finish(true));
    sock.on("error", () => finish(false));
    sock.on("timeout", () => finish(false));
  });
}

async function resolveHostname(ip: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("host", [ip], { timeout: 1000 });
    const m = stdout.match(/domain name pointer (\S+)\./);
    if (m) return m[1];
  } catch {}
  return ip;
}

async function getLocalSubnet(): Promise<string | null> {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    // Skip loopback and virtual interfaces
    if (name.startsWith("lo") || name.startsWith("docker") || name.startsWith("br-")) continue;
    const iface = ifaces[name];
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address; // return local IP — we'll compute subnet from cidr
      }
    }
  }
  return null;
}

function expandSubnet(localIp: string): string[] {
  // Assume /24 subnet — scan all 254 hosts
  const parts = localIp.split(".");
  if (parts.length !== 4) return [];
  const base = parts.slice(0, 3).join(".");
  const ips: string[] = [];
  for (let i = 1; i <= 254; i++) {
    const ip = `${base}.${i}`;
    if (ip !== localIp) ips.push(ip);
  }
  return ips;
}
