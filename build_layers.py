import os

directory = 'lambda/layers'

layers = os.listdir(directory)

for layer in layers:
    layer_path = os.path.join(directory, layer)
    if os.path.isdir(layer_path):
        print(f'Building layer: {layer}')
        os.system(f'cd {layer_path} && mkdir -p python && pip install -r requirements.txt -t python')