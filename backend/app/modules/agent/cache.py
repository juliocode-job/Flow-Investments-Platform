import re
import math
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.database import ChatCache

def tokenize(text: str) -> List[str]:
    """
    Tokenizes text by lowercasing and extracting alphanumeric sequences.
    """
    if not text:
        return []
    return re.findall(r'\w+', text.lower())

def get_tf(tokens: List[str]) -> Dict[str, float]:
    """
    Computes term frequency counts.
    """
    tf = {}
    for token in tokens:
        tf[token] = tf.get(token, 0.0) + 1.0
    return tf

def calculate_cosine_similarity(tf1: Dict[str, float], tf2: Dict[str, float]) -> float:
    """
    Calculates cosine similarity between two term frequency dictionaries.
    """
    dot_product = 0.0
    for word, count in tf1.items():
        if word in tf2:
            dot_product += count * tf2[word]
            
    mag1 = math.sqrt(sum(val ** 2 for val in tf1.values()))
    mag2 = math.sqrt(sum(val ** 2 for val in tf2.values()))
    
    if mag1 == 0.0 or mag2 == 0.0:
        return 0.0
        
    return dot_product / (mag1 * mag2)

def get_cached_response(db: Session, user_id: int, query: str) -> Optional[str]:
    """
    Checks for exact cache match first, then falls back to semantic similarity >= 0.82.
    """
    # 1. Check exact match
    exact_match = db.query(ChatCache).filter(
        ChatCache.user_id == user_id,
        ChatCache.query == query
    ).first()
    
    if exact_match:
        return exact_match.response
        
    # 2. Check semantic similarity
    # Get all cache entries for this user
    cache_entries = db.query(ChatCache).filter(ChatCache.user_id == user_id).all()
    if not cache_entries:
        return None
        
    input_tokens = tokenize(query)
    if not input_tokens:
        return None
        
    input_tf = get_tf(input_tokens)
    
    best_similarity = 0.0
    best_response = None
    
    for entry in cache_entries:
        entry_tokens = tokenize(entry.query)
        if not entry_tokens:
            continue
        entry_tf = get_tf(entry_tokens)
        
        sim = calculate_cosine_similarity(input_tf, entry_tf)
        if sim > best_similarity:
            best_similarity = sim
            best_response = entry.response
            
    if best_similarity >= 0.82:
        return best_response
        
    return None

def set_cache_response(db: Session, user_id: int, query: str, response: str) -> ChatCache:
    """
    Saves a query and response to the user's cache.
    """
    # If exact query exists, update it. Otherwise, create new
    existing = db.query(ChatCache).filter(
        ChatCache.user_id == user_id,
        ChatCache.query == query
    ).first()
    
    if existing:
        existing.response = response
        db.commit()
        db.refresh(existing)
        return existing
    else:
        new_entry = ChatCache(
            user_id=user_id,
            query=query,
            response=response
        )
        db.add(new_entry)
        db.commit()
        db.refresh(new_entry)
        return new_entry

def invalidate_user_cache(db: Session, user_id: int) -> None:
    """
    Deletes all cache entries for a specific user.
    """
    db.query(ChatCache).filter(ChatCache.user_id == user_id).delete()
    db.commit()
