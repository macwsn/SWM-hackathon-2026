-- ═══════════════════════════════════════════════════════════════
-- Blind Assistant - PostgreSQL Database Schema
-- ═══════════════════════════════════════════════════════════════

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";  -- For geospatial queries

-- ──────────────────────────────────────────────────────────────
-- Users table
-- ──────────────────────────────────────────────────────────────
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('blind_user', 'caregiver', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    
    -- User preferences
    preferred_language VARCHAR(10) DEFAULT 'pl',
    alert_threshold_indoor FLOAT DEFAULT 1.5,
    alert_threshold_outdoor FLOAT DEFAULT 2.0,
    tts_voice VARCHAR(100) DEFAULT 'pl-PL-ZofiaNeural'
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

-- ──────────────────────────────────────────────────────────────
-- Sessions table (user sessions)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INT,
    
    -- Session metadata
    device_type VARCHAR(50),  -- 'mobile', 'web'
    app_version VARCHAR(50),
    
    -- Statistics
    total_frames_processed INT DEFAULT 0,
    total_alerts INT DEFAULT 0,
    total_gemini_requests INT DEFAULT 0,
    
    -- Geospatial
    start_location GEOGRAPHY(POINT, 4326),
    end_location GEOGRAPHY(POINT, 4326),
    
    CONSTRAINT valid_duration CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_started ON sessions(started_at DESC);
CREATE INDEX idx_sessions_active ON sessions(ended_at) WHERE ended_at IS NULL;

-- ──────────────────────────────────────────────────────────────
-- Alerts table (obstacle detection alerts)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Alert details
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('obstacle', 'warning', 'info')),
    distance_meters FLOAT NOT NULL,
    is_indoor BOOLEAN NOT NULL,
    
    -- Alert message
    message_text TEXT NOT NULL,
    message_language VARCHAR(10) DEFAULT 'pl',
    
    -- Audio
    audio_url TEXT,  -- MinIO URL if archived
    tts_duration_ms INT,
    
    -- Location when alert occurred
    location GEOGRAPHY(POINT, 4326),
    
    -- Performance metrics
    processing_time_ms INT,  -- Frame → Alert latency
    
    -- User interaction
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    user_feedback VARCHAR(50)  -- 'helpful', 'false_positive', 'too_late', etc.
);

CREATE INDEX idx_alerts_session ON alerts(session_id);
CREATE INDEX idx_alerts_user ON alerts(user_id);
CREATE INDEX idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_location ON alerts USING GIST(location);

-- ──────────────────────────────────────────────────────────────
-- User locations table (GPS tracking)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE user_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    
    -- GPS metadata
    accuracy_meters FLOAT,
    altitude_meters FLOAT,
    speed_mps FLOAT,  -- meters per second
    heading_degrees FLOAT,  -- 0-360, where 0 is north
    
    -- Context
    is_indoor BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_locations_session ON user_locations(session_id);
CREATE INDEX idx_locations_user ON user_locations(user_id);
CREATE INDEX idx_locations_recorded ON user_locations(recorded_at DESC);
CREATE INDEX idx_locations_geog ON user_locations USING GIST(location);

-- ──────────────────────────────────────────────────────────────
-- Gemini requests table (LLM interaction logs)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE gemini_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Request details
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('scene_description', 'indoor_outdoor', 'poi_lookup')),
    
    -- Location context
    location GEOGRAPHY(POINT, 4326),
    pois_nearby TEXT[],  -- Array of POI names
    
    -- Response
    response_text TEXT,
    response_language VARCHAR(10),
    
    -- Performance
    latency_ms INT,
    tokens_used INT,
    
    -- Caching
    cache_hit BOOLEAN DEFAULT FALSE,
    
    -- Error handling
    error_message TEXT,
    retry_count INT DEFAULT 0
);

CREATE INDEX idx_gemini_session ON gemini_requests(session_id);
CREATE INDEX idx_gemini_user ON gemini_requests(user_id);
CREATE INDEX idx_gemini_created ON gemini_requests(created_at DESC);
CREATE INDEX idx_gemini_type ON gemini_requests(request_type);

-- ──────────────────────────────────────────────────────────────
-- Performance metrics table (system health tracking)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Service identifier
    service_name VARCHAR(100) NOT NULL,  -- 'depth-worker-a', 'orchestrator', etc.
    instance_id VARCHAR(255),  -- Docker container ID
    
    -- Metrics
    metric_name VARCHAR(100) NOT NULL,
    metric_value FLOAT NOT NULL,
    metric_unit VARCHAR(50),  -- 'ms', 'fps', 'bytes', etc.
    
    -- Labels (JSON for flexibility)
    labels JSONB
);

CREATE INDEX idx_metrics_service ON performance_metrics(service_name);
CREATE INDEX idx_metrics_recorded ON performance_metrics(recorded_at DESC);
CREATE INDEX idx_metrics_name ON performance_metrics(metric_name);

-- ──────────────────────────────────────────────────────────────
-- Trigger: Update user updated_at timestamp
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────
-- Trigger: Calculate session duration on end
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calculate_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_session_duration
BEFORE UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION calculate_session_duration();

