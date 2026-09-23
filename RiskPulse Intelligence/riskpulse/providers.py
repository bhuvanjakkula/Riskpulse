"""Read-only licensed adapters. No credentials or synthetic price fallbacks."""
import importlib.util
import math
import os
import re
import time
from datetime import date, datetime, timezone


def status():
    return {"version": "3.0.0", "licensed": {
        "connected": False,
        "bloombergInstalled": importlib.util.find_spec("blpapi") is not None,
        "lsegInstalled": importlib.util.find_spec("lseg") is not None,
        "reason": "Local edition: SDK availability is checked; a successful entitled request is required to verify access. B-PIPE is not configured.",
    }}


def validate_instruments(instruments):
    if not isinstance(instruments, list) or not 1 <= len(instruments) <= 50:
        raise ValueError("Provide 1 to 50 exact provider identifiers.")
    if any(not isinstance(s, str) or not s.strip() or len(s) > 120 or re.search(r"[\x00-\x1f]", s) for s in instruments):
        raise ValueError("Invalid provider identifier.")
    if len(set(instruments)) != len(instruments):
        raise ValueError("Duplicate provider identifiers.")
    return instruments


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) and n > 0 else None
    except (TypeError, ValueError):
        return None


def bloomberg(instruments):
    try:
        import blpapi
    except ImportError as exc:
        raise RuntimeError("Bloomberg SDK is not installed. Install the official BLPAPI SDK and sign in to Bloomberg Terminal on this machine.") from exc
    options = blpapi.SessionOptions()
    options.setServerHost("127.0.0.1")
    options.setServerPort(8194)
    session = blpapi.Session(options)
    results = {}
    try:
        if not session.start() or not session.openService("//blp/refdata"):
            raise RuntimeError("Bloomberg Desktop session unavailable. Check Terminal sign-in and API entitlement.")
        request = session.getService("//blp/refdata").createRequest("ReferenceDataRequest")
        for instrument in instruments:
            request.getElement("securities").appendValue(instrument)
        for field in ("PX_LAST", "CRNCY"):
            request.getElement("fields").appendValue(field)
        session.sendRequest(request)
        deadline = time.monotonic() + 25
        complete = False
        while time.monotonic() < deadline:
            event = session.nextEvent(1000)
            for message in event:
                if message.hasElement("responseError"):
                    raise RuntimeError("Bloomberg rejected the reference-data request. Check service entitlement.")
                if not message.hasElement("securityData"):
                    continue
                securities = message.getElement("securityData")
                for i in range(securities.numValues()):
                    security = securities.getValueAsElement(i)
                    sequence = security.getElementAsInteger("sequenceNumber")
                    if not 0 <= sequence < len(instruments):
                        continue
                    instrument = instruments[sequence]
                    row = {"instrument": instrument, "price": None, "currency": None, "asOf": None,
                           "timing": "Reference snapshot; quote timestamp and exchange delay unverified"}
                    if security.hasElement("securityError"):
                        row["error"] = "Security unavailable or not entitled"
                    else:
                        fields = security.getElement("fieldData")
                        if fields.hasElement("PX_LAST"):
                            row["price"] = number(fields.getElementAsFloat("PX_LAST"))
                        if fields.hasElement("CRNCY"):
                            row["currency"] = fields.getElementAsString("CRNCY")
                        if row["price"] is None or not row["currency"]:
                            row["error"] = "Required price or currency field missing; do not value holdings"
                    results[instrument] = row
            if event.eventType() == blpapi.Event.RESPONSE:
                complete = True
                break
        if not complete:
            raise RuntimeError("Bloomberg request timed out. Partial results were not applied.")
        return [results.get(s, {"instrument": s, "price": None, "currency": None, "asOf": None, "error": "No response for identifier"}) for s in instruments]
    finally:
        session.stop()


def lseg(instruments):
    try:
        import lseg.data as ld
    except ImportError as exc:
        raise RuntimeError("LSEG SDK is not installed. Install lseg-data and configure an authenticated Workspace or Data Platform session outside the source repository.") from exc
    session_name = os.environ.get("RISK_LSEG_SESSION", "desktop.workspace")
    if session_name not in ("desktop.workspace", "platform.ldp"):
        raise RuntimeError("RISK_LSEG_SESSION must be desktop.workspace or platform.ldp.")
    config_path = os.environ.get("RISK_LSEG_CONFIG")
    try:
        kwargs = {"name": session_name}
        if config_path:
            kwargs["config_name"] = config_path
        ld.open_session(**kwargs)
        frame = ld.get_data(universe=instruments, fields=["TR.PriceClose", "TR.PriceClose.Date", "TR.PriceClose.Currency"], use_field_names_in_headers=True)
        records = frame.to_dict(orient="records")
        by_id = {}
        for original in records:
            row = {str(k).lower(): v for k, v in original.items()}
            instrument = row.get("instrument")
            if instrument not in instruments:
                continue
            when = row.get("tr.priceclose.date")
            asof = str(when)[:10] if when is not None else None
            try:
                date.fromisoformat(asof)
            except (TypeError, ValueError):
                asof = None
            price = number(row.get("tr.priceclose"))
            currency = row.get("tr.priceclose.currency")
            valid_currency = isinstance(currency, str) and bool(re.fullmatch(r"[A-Za-z]{3}", currency))
            by_id[instrument] = {"instrument": instrument, "price": price, "currency": currency if valid_currency else None,
                                 "asOf": asof, "timing": "Vendor close; not a streaming quote"}
            if price is None or not asof or not valid_currency:
                by_id[instrument]["error"] = "Required price, date or currency missing; do not value holdings"
        return [by_id.get(s, {"instrument": s, "price": None, "currency": None, "asOf": None, "error": "No entitled data returned"}) for s in instruments]
    finally:
        ld.close_session()


def quotes(provider, instruments):
    validate_instruments(instruments)
    adapter = {"bloomberg": bloomberg, "lseg": lseg}.get(provider)
    if adapter is None:
        raise ValueError("Provider must be bloomberg or lseg.")
    return {"provider": provider, "retrievedAt": datetime.now(timezone.utc).isoformat(), "quotes": adapter(instruments)}
