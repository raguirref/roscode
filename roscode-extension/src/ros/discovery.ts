import * as net from "net";
import * as os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import type { RobotInfo } from "./connection";

const execFileAsync = promisify(execFile);

const ROS1_PORT = 11311;
const ROS2_DDS_PORTS = [7400, 7401, 7402];
const SCAN_CONCURRENCY = 40;
const PORT_TIMEOUT_MS = 400;

export async function discoverRosHosts(
  onFound: (robot: RobotInfo) => void,
  timeoutMs = 4000
): Promise<RobotInfo[]> {
  const localIp = getLocalIp();
  if (!localIp) return [];

  const ips = expandSubnet(localIp);
  const found: RobotInfo[] = [];
  const startTime = Date.now();

  for (let i = 0; i < ips.length; i += SCAN_CONCURRENCY) {
    if (Date.now() - startTime > timeoutMs) break;
    const batch = ips.slice(i, i + SCAN_CONCURRENCY);
    const results = await Promise.all(batch.map((ip) => probeHost(ip)));
    for (const r of results) {
      if (r) {
        found.push(r);
        onFound(r);
      }
    }
  }

  return found;
}

async function probeHost(ip: string): Promise<RobotInfo | null> {
  const ros1Open = await checkPort(ip, ROS1_PORT, PORT_TIMEOUT_MS);
  if (ros1Open) {
    const hostname = await resolveHostname(ip);
    return { ip, hostname, rosVersion: "ros1", masterPort: ROS1_PORT };
  }

  for (const port of ROS2_DDS_PORTS) {
    if (await checkPort(ip, port, PORT_TIMEOUT_MS)) {
      const hostname = await resolveHostname(ip);
      return { ip, hostname, rosVersion: "ros2", domainId: 0 };
    }
  }

  return null;
}

function checkPort(ip: string, port: number, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (v: boolean) => { if (!done) { done = true; sock.destroy(); resolve(v); } };
    sock.setTimeout(timeout);
    sock.connect(port, ip, () => finish(true));
    sock.on("error", () => finish(false));
    sock.on("timeout", () => finish(false));
  });
}

async function resolveHostname(ip: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("host", [ip], { timeout: 800 });
    const m = stdout.match(/domain name pointer (\S+)\./);
    if (m) return m[1].replace(/\.$/, "");
  } catch {}
  return ip;
}

function getLocalIp(): string | null {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (name.startsWith("lo") || name.startsWith("docker") || name.startsWith("br-") || name.startsWith("veth")) continue;
    for (const addr of ifaces[name] ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return null;
}

function expandSubnet(localIp: string): string[] {
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
