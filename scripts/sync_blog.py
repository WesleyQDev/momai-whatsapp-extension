import os
import json

def sync_blog():
    # Caminho da pasta de posts
    posts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'posts')
    output_file = os.path.join(posts_dir, 'posts.json')
    
    if not os.path.exists(posts_dir):
        print(f"Erro: Pasta {posts_dir} não encontrada.")
        return

    # Lista todos os arquivos .md na pasta
    files = [f for f in os.listdir(posts_dir) if f.endswith('.md')]
    
    # Ordenar por data de modificação (mais novos primeiro)
    files.sort(key=lambda x: os.path.getmtime(os.path.join(posts_dir, x)), reverse=True)

    # Cria o objeto JSON
    data = {
        "posts": files,
        "total": len(files)
    }

    # Salva o arquivo posts.json
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    print(f"Sucesso! {len(files)} posts sincronizados em posts.json")

if __name__ == "__main__":
    sync_blog()
