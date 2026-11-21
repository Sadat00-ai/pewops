#!/usr/bin/env python3
"""Deploys the PewOps server (server/worker.js) to Cloudflare Workers with a D1 database.

Needs two environment variables: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
On the very first deploy also set JWT_SECRET and ADMIN_KEY; later deploys keep the stored secrets.
It uses only the Python standard library and can safely be run again at any time.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
SCRIPT = os.environ.get("PEWOPS_WORKER_NAME", "pewops-api")
DB_NAME = os.environ.get("PEWOPS_DB_NAME", "pewops-db")
REPO = os.environ.get("GITHUB_REPOSITORY", "Sadat00-ai/pewops")
HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://api.cloudflare.com/client/v4"


def call(method, path, body=None, data=None, content_type="application/json"):
    headers = {"Authorization": "Bearer " + TOKEN}
    if body is not None:
        data = json.dumps(body).encode()
    if data is not None:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", "replace")
        try:
            return json.loads(text)
        except ValueError:
            return {"success": False, "errors": [{"message": "HTTP %d %s" % (error.code, text[:200])}]}


def need(result, what):
    if not result.get("success"):
        messages = "; ".join(e.get("message", "?") for e in result.get("errors", []))
        sys.exit("Cloudflare refused: %s (%s)" % (what, messages))
    return result.get("result")


def main():
    if not TOKEN or not ACCOUNT:
        sys.exit("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID first.")
    base = "/accounts/" + ACCOUNT

    # 1) the database
    databases = need(call("GET", base + "/d1/database?name=" + DB_NAME), "list databases")
    found = [d for d in databases if d.get("name") == DB_NAME]
    if found:
        db_id = found[0]["uuid"]
    else:
        db_id = need(call("POST", base + "/d1/database", {"name": DB_NAME}), "create database")["uuid"]
        print("created database", DB_NAME)

    # 2) the tables (every statement is IF NOT EXISTS)
    schema = open(os.path.join(HERE, "schema.sql"), encoding="utf-8").read()
    schema = re.sub(r"--[^\n]*", "", schema)
    for statement in [s.strip() for s in schema.split(";") if s.strip()]:
        need(call("POST", base + "/d1/database/" + db_id + "/query", {"sql": statement}), "run schema")
    print("database ready")

    # 3) the worker
    bindings = [
        {"type": "d1", "name": "DB", "id": db_id},
        {"type": "plain_text", "name": "GITHUB_REPO", "text": REPO},
    ]
    metadata = {"main_module": "worker.js", "compatibility_date": "2025-06-01", "bindings": bindings}
    for secret in ("JWT_SECRET", "ADMIN_KEY"):
        if os.environ.get(secret):
            bindings.append({"type": "secret_text", "name": secret, "text": os.environ[secret]})
    if not (os.environ.get("JWT_SECRET") and os.environ.get("ADMIN_KEY")):
        metadata["keep_bindings"] = ["secret_text"]      # reuse the secrets that are already stored

    boundary = "----pewops" + os.urandom(8).hex()
    source = open(os.path.join(HERE, "worker.js"), "rb").read()
    parts = []
    parts.append(("--" + boundary + '\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n' + json.dumps(metadata) + "\r\n").encode())
    parts.append(("--" + boundary + '\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n').encode() + source + b"\r\n")
    parts.append(("--" + boundary + "--\r\n").encode())
    need(call("PUT", base + "/workers/scripts/" + SCRIPT, data=b"".join(parts), content_type="multipart/form-data; boundary=" + boundary), "upload worker")
    print("worker uploaded")

    # 4) make it reachable on workers.dev
    call("POST", base + "/workers/scripts/" + SCRIPT + "/subdomain", {"enabled": True})
    sub = need(call("GET", base + "/workers/subdomain"), "read workers.dev name")
    print("URL: https://%s.%s.workers.dev" % (SCRIPT, sub["subdomain"]))


if __name__ == "__main__":
    main()
