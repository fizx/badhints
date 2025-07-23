import json

def reduce_embedding_precision(file_path, output_path, precision=4):
    """
    Loads a puzzle data file, reduces the precision of its embeddings,
    and saves it back.
    """
    print(f"Loading data from {file_path}...")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File not found at {file_path}")
        return

    embeddings = data.get('hint_embeddings')
    if not embeddings:
        print("Error: 'hint_embeddings' not found in the JSON file.")
        return

    print("Reducing precision of embeddings...")
    truncated_embeddings = [
        [round(num, precision) for num in vector]
        for vector in embeddings
    ]

    data['hint_embeddings'] = truncated_embeddings

    print(f"Saving smaller file to {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f) # No indentation for smallest size

    print("Done.")

if __name__ == "__main__":
    # We are overwriting the file in place as requested
    file_to_modify = 'src/server/puzzle_data.json'
    reduce_embedding_precision(file_to_modify, file_to_modify) 