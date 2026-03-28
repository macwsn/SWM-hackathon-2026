#!/usr/bin/env python3
"""
Test script for Gemini Live integration.

Usage:
    python test_gemini_live.py [--mock]
    
Options:
    --mock    Use mock mode (no API key required)
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from services.gemini_live_service import gemini_live_service
from config import USE_MOCK_GEMINI, GEMINI_API_KEY


async def test_caregiver_detection():
    """Test caregiver availability detection."""
    print("=" * 60)
    print("TEST 1: Caregiver Availability Detection")
    print("=" * 60)
    
    available = gemini_live_service.is_caregiver_available()
    print(f"✓ Caregiver available: {available}")
    print(f"✓ Expected: False (no caregivers connected in test)")
    print()


async def test_navigation_assistance():
    """Test navigation assistance with mock image."""
    print("=" * 60)
    print("TEST 2: Navigation Assistance")
    print("=" * 60)
    
    # Create a dummy JPEG image (1x1 pixel black image)
    # JPEG magic bytes + minimal valid JPEG structure
    dummy_jpeg = (
        b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        b'\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c'
        b'\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c'
        b'\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x0b\x08'
        b'\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x14\x00\x01\x00\x00\x00'
        b'\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xc4\x00\x14'
        b'\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
        b'\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\x00\xff\xd9'
    )
    
    test_location = {
        "lat": 52.2297,
        "lon": 21.0122
    }
    
    print(f"Mock mode: {USE_MOCK_GEMINI or not GEMINI_API_KEY}")
    if not USE_MOCK_GEMINI and GEMINI_API_KEY:
        print(f"API Key configured: {GEMINI_API_KEY[:20]}...")
    else:
        print("API Key: Not configured (using mock)")
    print(f"Location: {test_location['lat']}, {test_location['lon']}")
    print()
    
    try:
        print("Calling Gemini Live service...")
        response = await gemini_live_service.assist_navigation(
            image_bytes=dummy_jpeg,
            location=test_location,
            context="Test request for navigation assistance"
        )
        
        print("✓ SUCCESS")
        print(f"Response: {response}")
        print(f"Response length: {len(response)} characters")
        
    except Exception as e:
        print(f"✗ FAILED: {e}")
        import traceback
        traceback.print_exc()
    
    print()


async def test_rate_limiting():
    """Test rate limiting functionality."""
    print("=" * 60)
    print("TEST 3: Rate Limiting (2 second minimum interval)")
    print("=" * 60)
    
    dummy_jpeg = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9'
    test_location = {"lat": 52.2297, "lon": 21.0122}
    
    import time
    
    print("Making first call...")
    t1 = time.time()
    await gemini_live_service.assist_navigation(dummy_jpeg, test_location)
    t2 = time.time()
    print(f"✓ First call completed in {t2-t1:.2f}s")
    
    print("Making second call immediately (should wait ~2s)...")
    t3 = time.time()
    await gemini_live_service.assist_navigation(dummy_jpeg, test_location)
    t4 = time.time()
    elapsed = t4 - t3
    print(f"✓ Second call completed in {elapsed:.2f}s")
    
    if elapsed >= 1.8:  # Allow small margin
        print("✓ Rate limiting working correctly")
    else:
        print("⚠ Rate limiting may not be working (too fast)")
    
    print()


async def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("GEMINI LIVE SERVICE INTEGRATION TEST")
    print("=" * 60)
    print()
    
    # Check if mock mode requested
    if "--mock" in sys.argv:
        import config
        config.USE_MOCK_GEMINI = True
        print("⚠ Mock mode forced via --mock flag\n")
    
    try:
        await test_caregiver_detection()
        await test_navigation_assistance()
        await test_rate_limiting()
        
        print("=" * 60)
        print("ALL TESTS COMPLETED")
        print("=" * 60)
        
    except KeyboardInterrupt:
        print("\n\nTests interrupted by user")
    except Exception as e:
        print(f"\n\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())

