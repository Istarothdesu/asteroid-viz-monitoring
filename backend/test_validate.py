"""validate.py 的 Horizons 响应解析测试 (罐头文本, 不联网)。"""

from validate import parse_horizons_vector

# 真实 Horizons VECTORS 响应的典型片段 (JD + X/Y/Z 行)
SAMPLE = """
*******************************************************************************
$$SOE
2459000.500000000 = A.D. 2020-May-31 00:00:00.0000 TDB
 X = 9.848330018288023E-01 Y =-3.246111350597917E-01 Z =-1.407337391182136E-04
 VX= 5.994299546459610E-03 VY= 1.645703242486164E-02 VZ=-2.773297788976545E-07
$$EOE
*******************************************************************************
"""


def test_parse_horizons_vector():
    assert parse_horizons_vector(SAMPLE) == (
        9.848330018288023e-01,
        -3.246111350597917e-01,
        -1.407337391182136e-04,
    )


def test_parse_horizons_vector_garbage():
    assert parse_horizons_vector("no vector here") is None
    assert parse_horizons_vector("") is None


# 小天体 ('1;') 响应头部带解算历元的等效直角坐标, 不得误抓 (回归: 曾因此
# 把 Ceres 对比算成 7 亿 km 偏差)
SAMPLE_SMALL_BODY = """
  Equivalent ICRF heliocentric cartesian coordinates (au, au/d):
   X= 1.007608869613381E+00  Y=-2.390064275223502E+00  Z=-1.332124522752402E+00
*******************************************************************************
$$SOE
2461200.500000000 = A.D. 2026-Jun-09 00:00:00.0000 TDB
 X = 1.414905393343522E+00 Y = 2.369595284642237E+00 Z =-1.856420349175861E-01
 VX=-9.080926985478580E-03 VY= 4.602695869284281E-03 VZ= 1.818684668774817E-03
$$EOE
"""


def test_parse_horizons_vector_small_body_header():
    assert parse_horizons_vector(SAMPLE_SMALL_BODY) == (
        1.414905393343522e00,
        2.369595284642237e00,
        -1.856420349175861e-01,
    )
