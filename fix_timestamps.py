#!/usr/bin/env python3
"""
Fix metadata timestamps to ensure proper sorting (newest first)
Run this to fix all existing metadata files
"""

import os
import json
from datetime import datetime
from pathlib import Path


def fix_metadata_timestamps():
    """Fix all metadata files to have proper ISO timestamps"""
    backtest_dir = Path('backtest_results')
    
    if not backtest_dir.exists():
        print(f"❌ Directory not found: {backtest_dir}")
        return
    
    # Find all metadata files
    metadata_files = sorted(backtest_dir.glob('metadata_*.json'))
    print(f"Found {len(metadata_files)} metadata files\n")
    
    for metadata_path in metadata_files:
        try:
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            # Extract timestamp from filename if needed
            # Format: metadata_20251128_232904_abc123.json
            filename = metadata_path.stem  # metadata_20251128_232904_abc123
            parts = filename.split('_')
            
            if len(parts) >= 3:
                date_str = parts[1]  # 20251128
                time_str = parts[2]  # 232904
                
                # Parse to datetime
                try:
                    dt = datetime.strptime(f"{date_str}_{time_str}", "%Y%m%d_%H%M%S")
                    iso_timestamp = dt.isoformat()
                except:
                    # If parsing fails, use current time
                    iso_timestamp = datetime.now().isoformat()
            else:
                iso_timestamp = datetime.now().isoformat()
            
            # Update metadata
            old_timestamp = metadata.get('timestamp', 'N/A')
            metadata['timestamp'] = iso_timestamp
            
            # Ensure 'id' field exists (not 'backtest_id')
            if 'backtest_id' in metadata and 'id' not in metadata:
                metadata['id'] = metadata['backtest_id']
                del metadata['backtest_id']
            
            # Ensure 'summary' field exists (not 'results')
            if 'results' in metadata and 'summary' not in metadata:
                metadata['summary'] = metadata['results']
                del metadata['results']
            
            # Save updated metadata
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            print(f"✅ {metadata_path.name}")
            print(f"   Old timestamp: {old_timestamp}")
            print(f"   New timestamp: {iso_timestamp}")
            print(f"   ID: {metadata.get('id', 'N/A')}\n")
            
        except Exception as e:
            print(f"❌ Error processing {metadata_path.name}: {e}\n")
    
    print("\n" + "="*60)
    print("Testing sort order...")
    print("="*60 + "\n")
    
    # Load all metadata and test sorting
    all_metadata = []
    for metadata_path in metadata_files:
        try:
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
                all_metadata.append(metadata)
        except:
            pass
    
    # Sort by timestamp (newest first)
    all_metadata.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    
    print("Sorted order (newest first):")
    for i, meta in enumerate(all_metadata, 1):
        print(f"{i}. {meta.get('config', {}).get('strategy', 'Unknown')} - "
              f"{meta.get('id', 'N/A')} - {meta.get('timestamp', 'N/A')}")
    
    print("\n✅ All metadata files updated!")
    print("Refresh your Results page to see proper sorting.")


if __name__ == '__main__':
    print("="*60)
    print("Fixing Metadata Timestamps for Proper Sorting")
    print("="*60 + "\n")
    fix_metadata_timestamps()
