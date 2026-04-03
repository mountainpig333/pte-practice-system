#!/usr/bin/env python3
import re

with open('public/dashboard.html', 'r') as f:
    html = f.read()

# Add credentials to fetch with options object
html = re.sub(
    r"(await\s+)?fetch\('(/api[^']+)',\s*\{",
    r"\1fetch('\2', { credentials: 'include', ",
    html
)

# Add credentials to fetch without second arg (ends with ); )
html = re.sub(
    r"(await\s+)?fetch\('(/api[^']+)'\)(\s*;)",
    r"\1fetch('\2', { credentials: 'include' })\3",
    html
)

# Handle fetch('/api/xxx/' + id, { method:
html = re.sub(
    r"fetch\('(/api[^']+/)\' \+ id,\s*\{",
    r"fetch('\1', { credentials: 'include' } + id, {",
    html
)

# Handle fetch('/api/xxx/' + id);
html = re.sub(
    r"fetch\('(/api[^']+/)\' \+ id\)",
    r"fetch('\1', { credentials: 'include' } + id)",
    html
)

with open('public/dashboard.html', 'w') as f:
    f.write(html)

print("Done")