import "./App.css";
import { useState } from "react";

function App() {
  const KMA_API_KEY = import.meta.env.VITE_KMA_API_KEY;
  const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY;

  const [inputCity, setInputCity] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const getBaseDateTime = () => {
    const now = new Date();
    const target = new Date(now);

    target.setMinutes(target.getMinutes() - 45);

    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, "0");
    const date = String(target.getDate()).padStart(2, "0");
    const hour = String(target.getHours()).padStart(2, "0");

    return {
      base_date: `${year}${month}${date}`,
      base_time: `${hour}00`,
    };
  };

  const getRainText = (rainType) => {
    const code = String(rainType);

    if (code === "0") return "비 없음";
    if (code === "1") return "비";
    if (code === "2") return "비/눈";
    if (code === "3") return "눈";
    if (code === "5") return "빗방울";
    if (code === "6") return "빗방울/눈날림";
    if (code === "7") return "눈날림";

    return "정보 없음";
  };

  const convertToGrid = (lat, lon) => {
    const RE = 6371.00877;
    const GRID = 5.0;
    const SLAT1 = 30.0;
    const SLAT2 = 60.0;
    const OLON = 126.0;
    const OLAT = 38.0;
    const XO = 43;
    const YO = 136;

    const DEGRAD = Math.PI / 180.0;
    const re = RE / GRID;
    const slat1 = SLAT1 * DEGRAD;
    const slat2 = SLAT2 * DEGRAD;
    const olon = OLON * DEGRAD;
    const olat = OLAT * DEGRAD;

    let sn =
      Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
      Math.tan(Math.PI * 0.25 + slat1 * 0.5);

    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

    let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;

    let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
    ro = (re * sf) / Math.pow(ro, sn);

    let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
    ra = (re * sf) / Math.pow(ra, sn);

    let theta = lon * DEGRAD - olon;

    if (theta > Math.PI) theta -= 2.0 * Math.PI;
    if (theta < -Math.PI) theta += 2.0 * Math.PI;

    theta *= sn;

    const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
    const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

    return { nx, ny };
  };

  const searchAddressByKakao = async (keyword) => {
    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(
      keyword
    )}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.documents || data.documents.length === 0) {
      throw new Error("주소 검색 결과 없음");
    }

    const place = data.documents[0];

    const displayName =
      place.address_name ||
      place.road_address_name ||
      place.place_name ||
      keyword;

    return {
      name: place.place_name || keyword,
      address: displayName,
      lat: Number(place.y),
      lon: Number(place.x),
    };
  };

  const fetchWeatherByGrid = async ({ nx, ny, displayName }) => {
    const { base_date, base_time } = getBaseDateTime();

    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst?serviceKey=${decodeURIComponent(
      KMA_API_KEY
    )}&pageNo=1&numOfRows=100&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;

    const response = await fetch(url);
    const data = await response.json();

    const resultCode = data?.response?.header?.resultCode;
    const items = data?.response?.body?.items?.item;

    if (resultCode !== "00" || !items) {
      throw new Error("기상청 API 응답 오류");
    }

    const rainType = items.find((item) => item.category === "PTY")?.fcstValue;

    const result = {
      temp: items.find((item) => item.category === "T1H")?.fcstValue,
      humidity: items.find((item) => item.category === "REH")?.fcstValue,
      rainType,
      wind: items.find((item) => item.category === "WSD")?.fcstValue,
      rainText: getRainText(rainType),
      baseTime: base_time,
    };

    setSelectedCity(displayName);
    setWeather(result);
  };

  const handleSearch = async () => {
    if (!inputCity.trim()) {
      setError("지역명이나 주소를 입력해주세요. 예: 용인 역북동, 서울 강남역, 부산 해운대");
      setWeather(null);
      return;
    }

    setLoading(true);
    setError("");
    setWeather(null);

    try {
      const place = await searchAddressByKakao(inputCity.trim());
      const { nx, ny } = convertToGrid(place.lat, place.lon);

      await fetchWeatherByGrid({
        nx,
        ny,
        displayName: place.address || place.name,
      });
    } catch (error) {
      console.error(error);
      setError(
        "주소 검색 또는 날씨 조회에 실패했습니다. 예: '용인시 처인구 역북동', '서울 강남역'처럼 더 정확히 입력해주세요."
      );
      setWeather(null);
    } finally {
      setLoading(false);
    }
  };

  const getLaundryStatus = () => {
    if (!weather) return null;

    const temp = Number(weather.temp);
    const humidity = Number(weather.humidity);
    const wind = Number(weather.wind);
    const rainType = Number(weather.rainType);

    let score = 0;

    if (temp >= 25) score += 25;
    else if (temp >= 18) score += 15;
    else score += 5;

    if (humidity >= 80) score -= 40;
    else if (humidity >= 65) score -= 20;
    else score += 15;

    if (wind >= 3) score += 15;
    else if (wind >= 1.5) score += 8;

    if (rainType > 0) score -= 50;

    if (score >= 30) {
      return {
        level: "잘 마름",
        emoji: "☀️",
        className: "good",
        time: "약 3~4시간",
        message: "빨래가 비교적 잘 마를 가능성이 높습니다.",
        tip: "얇은 옷과 수건류 모두 건조하기 좋은 조건입니다.",
      };
    }

    if (score >= 5) {
      return {
        level: "느리게 마름",
        emoji: "🌥️",
        className: "normal",
        time: "약 5~7시간",
        message: "건조는 가능하지만 시간이 오래 걸릴 수 있습니다.",
        tip: "두꺼운 옷은 간격을 넓게 두고 말리는 것을 추천합니다.",
      };
    }

    if (score >= -25) {
      return {
        level: "냄새 위험",
        emoji: "😥",
        className: "bad",
        time: "약 8시간 이상",
        message: "습도가 높아 냄새 발생 가능성이 있습니다.",
        tip: "제습기 사용 또는 짧은 환기를 함께 하는 것이 좋습니다.",
      };
    }

    return {
      level: "실내 건조 추천",
      emoji: "🌧️",
      className: "rain",
      time: "실외 건조 비추천",
      message: "비 또는 높은 습도로 인해 실외 건조는 비추천입니다.",
      tip: "창문을 닫고 제습기나 에어컨 제습 모드를 사용하는 것이 좋습니다.",
    };
  };

  const getCurrentTimeText = () => {
    const now = new Date();

    return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}.${String(now.getDate()).padStart(2, "0")} ${String(
      now.getHours()
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} 기준`;
  };

  const laundryStatus = getLaundryStatus();

  return (
    <div className={`app ${laundryStatus ? laundryStatus.className : ""}`}>
      <section className="hero">
        <div className="badge">자취생 맞춤 기상 서비스</div>

        <h1>자취생 빨래 건조 위험도 예측 서비스</h1>

        <p className="subtitle">
          카카오 주소검색 API와 기상청 API 데이터를 활용하여 지역별 기온, 습도,
          풍속, 강수형태를 분석하고 빨래 건조 가능성을 예측합니다.
        </p>

        <div className="search-box">
          <input
            value={inputCity}
            onChange={(e) => setInputCity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="지역/주소 입력 예: 용인시 처인구 역북동, 서울 강남역"
          />
          <button onClick={handleSearch}>조회하기</button>
        </div>

        <p className="city-guide">
          전국 지역 검색 가능 · 예: 용인시 처인구 역북동, 명지대 자연캠퍼스,
          서울 강남역
        </p>
      </section>

      {loading && (
        <p className="loading">
          ⏳ 주소를 검색하고 기상청 데이터를 불러와 빨래 건조 조건을 분석
          중입니다...
        </p>
      )}

      {error && <div className="error-box">{error}</div>}

      {weather && laundryStatus && (
        <main className="content-card">
          <div className={`result-box ${laundryStatus.className}`}>
            <div className="weather-icon">{laundryStatus.emoji}</div>
            <h2>{selectedCity} 빨래 건조 상태</h2>
            <h3>{laundryStatus.level}</h3>
            <p>{laundryStatus.message}</p>
            <span>{getCurrentTimeText()}</span>
          </div>

          <div className="weather-grid">
            <div className="info-card">
              <h4>🌡️ 기온</h4>
              <p>{weather.temp}℃</p>
            </div>

            <div className="info-card">
              <h4>💧 습도</h4>
              <p>{weather.humidity}%</p>
            </div>

            <div className="info-card">
              <h4>💨 풍속</h4>
              <p>{weather.wind}m/s</p>
            </div>

            <div className="info-card">
              <h4>🌧️ 강수형태</h4>
              <p>{weather.rainText}</p>
            </div>
          </div>

          <div className="estimate-box">
            <h3>⏱️ 예상 건조 시간</h3>
            <p>{laundryStatus.time}</p>
          </div>

          <div className="clothes-box">
            <h3>👕 빨래 종류별 추천</h3>
            <div className="clothes-list">
              <p>
                얇은 옷: {laundryStatus.className === "rain" ? "비추천" : "가능"}
              </p>
              <p>
                수건류: {laundryStatus.className === "good" ? "가능" : "주의"}
              </p>
              <p>
                이불/후드티:{" "}
                {laundryStatus.className === "good"
                  ? "가능"
                  : "실내 건조 추천"}
              </p>
            </div>
          </div>

          <div className="tip-box">
            <h3>💡 실내 건조 추천 행동</h3>
            <p>{laundryStatus.tip}</p>
          </div>
        </main>
      )}

      <footer>
        본 서비스는 카카오 주소검색 API와 기상청 단기예보 조회서비스 데이터를
        활용하였습니다.
        <br />
        출처: Kakao Developers, 공공데이터포털(data.go.kr), 기상청
      </footer>
    </div>
  );
}

export default App;