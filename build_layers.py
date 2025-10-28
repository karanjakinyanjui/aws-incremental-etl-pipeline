import os

directory = 'lambda/layers'

layers = os.listdir(directory)

for layer in layers:
    layer_path = os.path.join(directory, layer)
    if os.path.isdir(layer_path):
        # Check if requirements.txt exists in the layer directory
        requirements_path = os.path.join(layer_path, 'requirements.txt')
        if not os.path.isfile(requirements_path):
            print(f'Skipping layer {layer} as no requirements.txt found.')
            continue
        print(f'Building layer: {layer}')
        os.system(f'cd {layer_path} && mkdir -p python && pip install -r requirements.txt -t python')