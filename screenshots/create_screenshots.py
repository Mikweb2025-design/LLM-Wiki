#!/usr/bin/env python3
"""Crea screenshot placeholder per la documentazione"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_placeholder_screenshot(filename, title, description, width=1200, height=800):
    """Crea un'immagine placeholder con testo descrittivo"""
    # Crea immagine sfondo scuro
    img = Image.new('RGB', (width, height), color=(24, 25, 40))
    draw = ImageDraw.Draw(img)
    
    # Font (usa default se non disponibili)
    try:
        font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 48)
        font_medium = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()
    
    # Titolo
    draw.text((width//2, 100), title, fill=(126, 231, 135), font=font_large, anchor="mm")
    
    # Descrizione
    draw.text((width//2, 200), description, fill=(200, 200, 200), font=font_medium, anchor="mm")
    
    # Bordo decorativo
    draw.rectangle([50, 50, width-50, height-50], outline=(74, 158, 255), width=2)
    
    # Salva
    img.save(filename, quality=95)
    print(f"Creato: {filename}")

if __name__ == "__main__":
    os.makedirs("screenshots", exist_ok=True)
    
    screenshots = [
        ("screenshots/dashboard.png", "LLM Wiki Dashboard", "Panoramica completa dei documenti e metriche"),
        ("screenshots/chat.png", "Chat Intelligente", "Chat testuale e vocale con i tuoi documenti"),
        ("screenshots/compare.png", "Confronto Documenti", "Confronta il contenuto di due file side by side"),
        ("screenshots/documents.png", "Gestione Documenti", "Upload, scansione e gestione dei tuoi file"),
    ]
    
    for filename, title, description in screenshots:
        create_placeholder_screenshot(filename, title, description)
    
    print("\nScreenshot placeholder creati!")
    print("Sostituiscili con screenshot reali dell'applicazione.")
