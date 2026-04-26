<script lang="ts">
  import { onMount } from "svelte";
  import { lanScan, type LanHost } from "../tauri";
  import { chatMessages, rightPanelOpen } from "../stores/layout";

  let hosts: LanHost[] = [];
  let selected: LanHost | null = null;
  let scanning = false;
  let scanErr = "";
  let lastScan = "";
  let filter = "";

  $: filteredHosts = hosts.filter(
    (h) => !filter || h.ip.includes(filter) || h.mac.includes(filter) || h.iface.includes(filter),
  );

  // Group counts by interface
  $: ifaces = Array.from(new Set(hosts.map((h) => h.iface).filter(Boolean)));

  async function rescan() {
    scanning = true;
    scanErr = "";
    try {
      hosts = await lanScan();
      lastScan = new Date().toLocaleTimeString();
      if (!selected && hosts.length) selected = hosts[0];
      else if (selected && !hosts.find((h) => h.ip === selected!.ip)) {
        selected = hosts[0] ?? null;
      }
    } catch (e) {
      scanErr = String(e);
    } finally {
      scanning = false;
    }
  }

  onMount(rescan);

  function ipPrefix(ip: string) {
    const parts = ip.split(".");
    if (parts.length !== 4) return ip;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }

  function macVendor(mac: string): string {
    // Cheap OUI hint — first 3 octets are the vendor prefix; we just show them.
    const parts = mac.split(":");
    if (parts.length < 3) return "—";
    return parts.slice(0, 3).join(":").toUpperCase();
  }

  function inspectViaAgent(h: LanHost) {
    const prompt = `Host ${h.ip} (${h.mac}, on ${h.iface}) is on the local network. Try to discover any ROS 2 nodes it is publishing — describe what tools or commands you would use, then run them and report.`;
    chatMessages.update((ms) => [...ms, { kind: "user", text: prompt }]);
    rightPanelOpen.set(true);
  }
</script>

<div class="page">
  <div class="bp-grid grid-bg"></div>
  <div class="shell">
    <!-- ═══ Host list ═══ -->
    <div class="host-col">
      <div style="position:relative">
        <div class="label-sm accent">// LAN · ARP CACHE</div>
        <div class="page-title">network</div>
      </div>

      <div class="filter-row">
        <div class="pill-row">
          <span class="pill active">{hosts.length} HOSTS</span>
          {#each ifaces as i}
            <span class="pill">{i.toUpperCase()}</span>
          {/each}
        </div>
        <button class="btn-sm" on:click={rescan} disabled={scanning}>
          {scanning ? "…" : "↺"} RESCAN
        </button>
      </div>

      <div class="search-box">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input class="search-input" placeholder="filter by ip / mac / iface…" bind:value={filter} />
      </div>

      <div class="panel host-list">
        <div class="list-header">
          <div></div><div>HOST</div><div>IFACE</div>
        </div>

        {#if scanErr}
          <div class="empty err">{scanErr}</div>
        {:else if scanning && hosts.length === 0}
          <div class="empty">scanning ARP cache…</div>
        {:else if filteredHosts.length === 0}
          <div class="empty">
            {hosts.length === 0
              ? "No hosts in the ARP cache. Try pinging a peer first or use 'rescan' after activity."
              : `No hosts match "${filter}".`}
          </div>
        {:else}
          {#each filteredHosts as h}
            <button class="host-row" class:sel={selected?.ip === h.ip} on:click={() => (selected = h)}>
              <div class="dot ok"></div>
              <div>
                <div class="mono-sm">{h.ip}</div>
                <div class="meta">{h.mac}</div>
              </div>
              <div class="iface-tag">{h.iface || "—"}</div>
            </button>
          {/each}
        {/if}
      </div>

      {#if lastScan}
        <div class="refresh-row">
          <span>scanned {lastScan}</span>
        </div>
      {/if}
    </div>

    <!-- ═══ Detail ═══ -->
    <div class="detail-col">
      {#if !selected}
        <div class="no-selection">No host selected.</div>
      {:else}
        <div class="panel robot-header">
          <div class="robot-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="8" width="14" height="10" rx="2"/><circle cx="9.5" cy="13" r="1.2" fill="currentColor"/><circle cx="14.5" cy="13" r="1.2" fill="currentColor"/><path d="M12 4v4M8 18v2M16 18v2"/></svg>
          </div>
          <div>
            <div class="robot-name">{selected.ip}</div>
            <div class="meta">{selected.mac} · IFACE {selected.iface || "—"}</div>
          </div>
          <div style="flex:1"></div>
          <button class="btn-sm" on:click={() => { if (selected) navigator.clipboard?.writeText(selected.ip); }}>copy ip</button>
          <button class="btn-sm btn-primary" on:click={() => { if (selected) inspectViaAgent(selected); }}>ask agent</button>
        </div>

        <div class="info-grid">
          {#each [
            ["IP", selected.ip],
            ["MAC", selected.mac],
            ["VENDOR", macVendor(selected.mac)],
            ["SUBNET", ipPrefix(selected.ip)],
          ] as [k, v]}
            <div class="info-card">
              <div class="info-k">{k}</div>
              <div class="info-v">{v}</div>
            </div>
          {/each}
        </div>

        <div class="panel">
          <div class="panel-header">
            <span class="mono-label">DISCOVERY</span>
            <span class="dim">arp -a · best-effort</span>
          </div>
          <div class="discovery-body">
            <p>
              Host data comes from the OS ARP cache. Subnet sweeps and mDNS
              browsing aren't built in yet — use <strong>"ask agent"</strong>
              to have the assistant probe this host for ROS topics, services, or
              known ports.
            </p>
            <ul>
              <li>To populate this list, talk to peers first (ping, mDNS).</li>
              <li>Hosts marked <code>(incomplete)</code> in arp are filtered out.</li>
              <li>Subnet inferred from /24 of the IP — adjust if your LAN differs.</li>
            </ul>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .page { flex:1; overflow:auto; padding:20px; position:relative; min-height:0; }
  .grid-bg { position:absolute; inset:0; opacity:.25; pointer-events:none; }
  .shell { display:grid; grid-template-columns:320px 1fr; gap:14px; height:100%; position:relative; }

  .label-sm { font-family:var(--font-mono); font-size:10px; color:var(--accent); letter-spacing:2px; text-transform:uppercase; }
  .accent { color:var(--accent); }
  .page-title { font-size:24px; font-weight:600; letter-spacing:-.4px; margin-top:2px; }
  .mono-label { font-family:var(--font-mono); font-size:10px; color:var(--fg-2); letter-spacing:1.5px; text-transform:uppercase; }
  .mono-sm { font-family:var(--font-mono); font-size:12px; color:var(--fg-0); }
  .meta { font-family:var(--font-mono); font-size:10px; color:var(--fg-2); }
  .dim { color:var(--fg-3); font-family:var(--font-mono); font-size:10px; }
  .err { color:var(--err); }

  .host-col { display:flex; flex-direction:column; gap:10px; min-height:0; }
  .filter-row { display:flex; align-items:center; gap:8px; }
  .pill-row { display:flex; gap:4px; flex-wrap:wrap; flex:1; }
  .pill { display:inline-flex; align-items:center; padding:3px 8px; border:1px solid var(--border); border-radius:var(--radius); font-family:var(--font-mono); font-size:10px; color:var(--fg-2); letter-spacing:.3px; }
  .pill.active { background:var(--accent-dim); border-color:var(--accent-line); color:var(--accent); }

  .search-box { display:flex; align-items:center; gap:8px; padding:7px 10px; background:var(--bg-2); border:1px solid var(--border); border-radius:var(--radius); }
  .search-input { flex:1; background:transparent; border:none; outline:none; font-family:var(--font-mono); font-size:11px; color:var(--fg-0); }
  .search-input::placeholder { color:var(--fg-3); }

  .panel { background:var(--bg-2); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
  .panel-header { display:flex; align-items:center; justify-content:space-between; padding:9px 14px; border-bottom:1px solid var(--border); }

  .host-list { flex:1; overflow:auto; min-height:120px; }
  .list-header { display:grid; grid-template-columns:16px 1fr 60px; gap:10px; padding:7px 12px; border-bottom:1px solid var(--border); font-family:var(--font-mono); font-size:9px; color:var(--fg-2); letter-spacing:1.5px; text-transform:uppercase; }
  .empty { padding:18px 14px; font-family:var(--font-mono); font-size:11px; color:var(--fg-3); line-height:1.5; }

  .host-row {
    display:grid; grid-template-columns:16px 1fr 60px; gap:10px;
    padding:10px 12px; border-bottom:1px solid var(--border);
    background:transparent; border-radius:0; border-left:2px solid transparent;
    text-align:left; cursor:pointer; width:100%;
  }
  .host-row:last-child { border-bottom:none; }
  .host-row.sel { background:var(--accent-dim); border-left-color:var(--accent); }
  .host-row:hover:not(.sel) { background:var(--bg-3); }
  .iface-tag { font-family:var(--font-mono); font-size:9px; color:var(--fg-3); letter-spacing:.5px; text-transform:uppercase; align-self:center; }

  .dot { width:6px; height:6px; border-radius:50%; margin-top:5px; }
  .dot.ok { background:var(--ok); }

  .refresh-row { font-family:var(--font-mono); font-size:9px; color:var(--fg-3); letter-spacing:.8px; padding:0 2px; }

  /* detail */
  .detail-col { display:flex; flex-direction:column; gap:10px; min-height:0; }
  .no-selection { display:flex; align-items:center; justify-content:center; flex:1; font-family:var(--font-mono); font-size:12px; color:var(--fg-3); }
  .robot-header { padding:18px; display:flex; align-items:center; gap:14px; }
  .robot-icon {
    width:44px; height:44px; border-radius:var(--radius);
    background:var(--accent-dim); border:1px solid var(--accent-line);
    display:flex; align-items:center; justify-content:center; color:var(--accent);
  }
  .robot-name { font-size:18px; font-weight:600; letter-spacing:-.3px; font-family:var(--font-mono); }

  .info-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  .info-card { padding:10px 12px; background:var(--bg-2); border:1px solid var(--border); border-radius:var(--radius); }
  .info-k { font-family:var(--font-mono); font-size:9px; color:var(--fg-2); letter-spacing:1.5px; }
  .info-v { font-family:var(--font-mono); font-size:13px; color:var(--fg-0); margin-top:4px; word-break: break-all; }

  .discovery-body { padding:14px 18px; font-size:12px; color:var(--fg-1); line-height:1.6; }
  .discovery-body p { margin: 0 0 10px; }
  .discovery-body ul { margin: 0; padding-left: 18px; color: var(--fg-2); font-size: 11.5px; }
  .discovery-body code { background: var(--bg-3); padding: 1px 5px; border-radius: 3px; color: var(--fg-1); }
  .discovery-body strong { color: var(--accent); }

  .btn-sm { padding:5px 10px; font-size:10px; letter-spacing:.4px; text-transform:uppercase; border-radius:var(--radius-sm); }
  .btn-sm:disabled { opacity: .4; cursor: not-allowed; }
  .btn-primary { background:var(--accent); color:#1a1408; border-color:var(--accent); font-weight:600; }
  .btn-primary:hover:not(:disabled) { background:var(--accent); opacity:.9; color:#1a1408; border-color:var(--accent); }
</style>
