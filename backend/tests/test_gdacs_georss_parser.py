"""Regression tests for GDACS public GeoRSS/RSS feed parser (Phase 2B).

Verifies that GDACSAdapter correctly parses standard GeoRSS feeds (https://www.gdacs.org/xml/rss.xml),
extracts latitude/longitude from <georss:point>, preserves GDACS event attributes,
and never creates fake coordinates when georss:point is absent.
"""

from __future__ import annotations

import httpx
import pytest

from app.adapters.gdacs import GDACSAdapter
from app.models import AlertProvenance, HazardSeverity, HazardType

SAMPLE_GDACS_RSS = """<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#"
  xmlns:georss="http://www.georss.org/georss"
  xmlns:gdacs="http://www.gdacs.org">
  <channel>
    <title>GDACS - Global Disaster Alert and Coordination System</title>
    <link>https://www.gdacs.org</link>
    <description>Disaster Alerts</description>
    <item>
      <title>Red alert for tropical cyclone TEST-CYC-26</title>
      <description>Severe tropical cyclone with peak winds of 195 km/h.</description>
      <link>https://www.gdacs.org/report.aspx?eventtype=TC&amp;eventid=99001</link>
      <pubDate>Tue, 01 Sep 2026 10:00:00 GMT</pubDate>
      <guid>TC99001</guid>
      <georss:point>15.2500 85.5000</georss:point>
      <gdacs:eventtype>TC</gdacs:eventtype>
      <gdacs:alertlevel>Red</gdacs:alertlevel>
      <gdacs:alertscore>2.5</gdacs:alertscore>
      <gdacs:eventname>TEST-CYC-26</gdacs:eventname>
      <gdacs:eventid>99001</gdacs:eventid>
      <gdacs:severity>Category 3 Tropical Cyclone (195 km/h)</gdacs:severity>
      <gdacs:country>India</gdacs:country>
      <gdacs:iso3>IND</gdacs:iso3>
      <gdacs:fromdate>Tue, 01 Sep 2026 06:00:00 GMT</gdacs:fromdate>
      <gdacs:todate>Wed, 02 Sep 2026 18:00:00 GMT</gdacs:todate>
    </item>
    <item>
      <title>Orange earthquake (Magnitude 6.8M, Depth:10km) in Japan</title>
      <description>Strong shallow earthquake offshore Honshu.</description>
      <link>https://www.gdacs.org/report.aspx?eventtype=EQ&amp;eventid=99002</link>
      <pubDate>Tue, 01 Sep 2026 08:30:00 GMT</pubDate>
      <guid>EQ99002</guid>
      <georss:point>38.2500 142.5000</georss:point>
      <gdacs:eventtype>EQ</gdacs:eventtype>
      <gdacs:alertlevel>Orange</gdacs:alertlevel>
      <gdacs:eventname>Off Honshu</gdacs:eventname>
      <gdacs:eventid>99002</gdacs:eventid>
      <gdacs:severity>Magnitude 6.8M, Depth 10km</gdacs:severity>
      <gdacs:country>Japan</gdacs:country>
      <gdacs:iso3>JPN</gdacs:iso3>
    </item>
    <item>
      <title>Green notification for flood in Bangladesh</title>
      <description>Localized seasonal monsoon inundation.</description>
      <link>https://www.gdacs.org/report.aspx?eventtype=FL&amp;eventid=99003</link>
      <pubDate>Mon, 31 Aug 2026 12:00:00 GMT</pubDate>
      <guid>FL99003</guid>
      <georss:point>24.1200 90.3500</georss:point>
      <gdacs:eventtype>FL</gdacs:eventtype>
      <gdacs:alertlevel>Green</gdacs:alertlevel>
      <gdacs:eventname>Surma Basin</gdacs:eventname>
      <gdacs:eventid>99003</gdacs:eventid>
      <gdacs:country>Bangladesh</gdacs:country>
    </item>
    <item>
      <title>Drought summary across Horn of Africa</title>
      <description>Extended dry conditions across multiple pastoral zones.</description>
      <link>https://www.gdacs.org/report.aspx?eventtype=DR&amp;eventid=99004</link>
      <pubDate>Mon, 31 Aug 2026 10:00:00 GMT</pubDate>
      <guid>DR99004</guid>
      <gdacs:eventtype>DR</gdacs:eventtype>
      <gdacs:alertlevel>Orange</gdacs:alertlevel>
      <gdacs:eventname>Horn of Africa Drought</gdacs:eventname>
      <gdacs:eventid>99004</gdacs:eventid>
      <gdacs:country>Somalia</gdacs:country>
    </item>
  </channel>
</rss>
"""


@pytest.mark.asyncio
async def test_1_gdacs_rss_parsing_standard_items():
    """Verify standard GeoRSS items parse title, description, link, severity, and timestamps."""
    transport = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            text=SAMPLE_GDACS_RSS,
            headers={"Content-Type": "application/rss+xml"},
        )
    )

    adapter = GDACSAdapter()
    async with httpx.AsyncClient(transport=transport) as client:
        alerts, prov = await adapter.fetch_alerts(client=client)

    assert prov == AlertProvenance.LIVE
    assert len(alerts) == 4

    # 1. Red Tropical Cyclone
    cyc = alerts[0]
    assert cyc.id == "alt-gdacs-99001"
    assert cyc.hazard_type == HazardType.CYCLONE
    assert cyc.severity == HazardSeverity.CRITICAL
    assert "TEST-CYC-26" in cyc.title
    assert cyc.source_url == "https://www.gdacs.org/report.aspx?eventtype=TC&eventid=99001"
    assert "India" in cyc.affected_area


@pytest.mark.asyncio
async def test_2_georss_point_latitude_longitude_ordering():
    """Verify GeoRSS point 'lat lon' ordering is strictly preserved without inversion."""
    transport = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            text=SAMPLE_GDACS_RSS,
            headers={"Content-Type": "application/rss+xml"},
        )
    )

    adapter = GDACSAdapter()
    async with httpx.AsyncClient(transport=transport) as client:
        alerts, _ = await adapter.fetch_alerts(client=client)

    # Item 1: <georss:point>15.2500 85.5000</georss:point>
    cyc = alerts[0]
    assert cyc.latitude == pytest.approx(15.25, abs=1e-4)
    assert cyc.longitude == pytest.approx(85.50, abs=1e-4)

    # Item 2: <georss:point>38.2500 142.5000</georss:point>
    eq = alerts[1]
    assert eq.latitude == pytest.approx(38.25, abs=1e-4)
    assert eq.longitude == pytest.approx(142.50, abs=1e-4)


@pytest.mark.asyncio
async def test_3_event_type_mapping():
    """Verify GDACS 2-letter codes map to correct HazardType."""
    transport = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            text=SAMPLE_GDACS_RSS,
            headers={"Content-Type": "application/rss+xml"},
        )
    )

    adapter = GDACSAdapter()
    async with httpx.AsyncClient(transport=transport) as client:
        alerts, _ = await adapter.fetch_alerts(client=client)

    assert alerts[0].hazard_type == HazardType.CYCLONE
    assert alerts[1].hazard_type == HazardType.EARTHQUAKE
    assert alerts[2].hazard_type == HazardType.FLOOD
    assert alerts[3].hazard_type == HazardType.OTHER


@pytest.mark.asyncio
async def test_4_alert_level_mapping():
    """Verify Red, Orange, Green alert levels map correctly."""
    transport = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            text=SAMPLE_GDACS_RSS,
            headers={"Content-Type": "application/rss+xml"},
        )
    )

    adapter = GDACSAdapter()
    async with httpx.AsyncClient(transport=transport) as client:
        alerts, _ = await adapter.fetch_alerts(client=client)

    assert alerts[0].severity == HazardSeverity.CRITICAL  # Red
    assert alerts[1].severity == HazardSeverity.WARNING  # Orange
    assert alerts[2].severity == HazardSeverity.ADVISORY  # Green


@pytest.mark.asyncio
async def test_5_missing_point_no_fake_geo():
    """Verify item without georss:point has None coordinates (no fake geo)."""
    transport = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            text=SAMPLE_GDACS_RSS,
            headers={"Content-Type": "application/rss+xml"},
        )
    )

    adapter = GDACSAdapter()
    async with httpx.AsyncClient(transport=transport) as client:
        alerts, _ = await adapter.fetch_alerts(client=client)

    # Item 4 (Horn of Africa Drought) has no georss:point
    drought = alerts[3]
    assert drought.latitude is None
    assert drought.longitude is None
    assert "Somalia" in drought.affected_area


@pytest.mark.asyncio
async def test_6_caching_and_ttl():
    """Verify in-memory caching prevents redundant HTTP calls."""
    call_count = 0

    def handle(req):
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, text=SAMPLE_GDACS_RSS)

    transport = httpx.MockTransport(handle)
    adapter = GDACSAdapter(cache_ttl_seconds=300)

    async with httpx.AsyncClient(transport=transport) as client:
        alerts1, prov1 = await adapter.fetch_alerts(client=client)
        assert prov1 == AlertProvenance.LIVE
        assert call_count == 1

        # Second call within TTL returns CACHED
        alerts2, prov2 = await adapter.fetch_alerts(client=client)
        assert prov2 == AlertProvenance.CACHED
        assert call_count == 1
        assert len(alerts2) == len(alerts1)


@pytest.mark.asyncio
async def test_7_live_gdacs_rss_endpoint():
    """Verify the real live public GDACS RSS feed returns HTTP 200 and > 0 alerts."""
    adapter = GDACSAdapter()
    alerts, prov = await adapter.fetch_alerts(timeout=15.0)

    assert prov == AlertProvenance.LIVE
    assert len(alerts) > 0, "GDACS adapter returned 0 alerts from live RSS feed!"
    print(f"\nLive GDACS RSS Ingestion: parsed {len(alerts)} global disaster alerts successfully.")

    # Check that at least some alerts have valid coordinates
    with_coords = [a for a in alerts if a.latitude is not None and a.longitude is not None]
    assert len(with_coords) > 0
    print(f"Alerts with verified georss coordinates: {len(with_coords)} / {len(alerts)}")
