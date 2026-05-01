import re

with open('studio/src/lib/brand/icon-dark.svg', 'r') as f:
    svg_content = f.read()

# We want to embed the exact defs and paths, but we need to shift the viewBox or translate it
# roscode_icon_dark.svg has viewBox="0 0 1440 809.999993"
# The center is at x=720, y=405
# A square 810x810 centered would have x from 720-405 = 315 to 720+405 = 1125

app_icon_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#0d1117" rx="224" />
  <g transform="translate(107, 107) scale(1.0) translate(-315, 0)">
    {svg_content.replace('<svg xmlns="http://www.w3.org/2000/svg" width="1920" zoomAndPan="magnify" viewBox="0 0 1440 809.999993" height="1080" preserveAspectRatio="xMidYMid meet" version="1.0">', '').replace('</svg>', '')}
  </g>
</svg>
"""

with open('studio/app-icon.svg', 'w') as f:
    f.write(app_icon_svg)

