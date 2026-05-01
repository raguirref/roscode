import re

def set_viewbox(filename, new_viewbox):
    with open(filename, 'r') as f:
        content = f.read()
    
    # Replace viewBox="0 0 1440 809.999993" or similar
    content = re.sub(r'viewBox="0 0 1440 809[^"]*"', f'viewBox="{new_viewbox}"', content)
    # Also remove width and height so it scales to container
    content = re.sub(r'width="\d+"', 'width="100%"', content, count=1)
    content = re.sub(r'height="\d+"', 'height="100%"', content, count=1)
    
    with open(filename, 'w') as f:
        f.write(content)

set_viewbox('studio/src/lib/brand/icon-dark.svg', '389 73 660 660')
set_viewbox('studio/src/lib/brand/name-icon-white.svg', '430 70 650 660')
set_viewbox('studio/src/lib/brand/name-studio-white.svg', '196 314 1047 182')

