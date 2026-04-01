cmake_minimum_required(VERSION 3.16)
project(cmv_c_samples)

if(WIN32)
    include_directories($ENV{CMV_INSTALL_DIR}/sdk/C/include)
    link_directories($ENV{CMV_INSTALL_DIR}/sdk/C/lib)
endif()

if(UNIX)
    include_directories(/usr/include/carmen_video_sdk/c)
    link_directories(/usr/lib/carmen_video_sdk)
endif()

include_directories(common)

add_subdirectory(01_minimal)
add_subdirectory(02_basic)
add_subdirectory(03_result_details)
add_subdirectory(04_multi_stream)
add_subdirectory(05_cloud)
# 06_custom_stream: intentionally omitted, see C++ sample
add_subdirectory(07_multistage_anpr)

if(UNIX)
    set_target_properties(
            c_sample_01_minimal
            c_sample_02_basic
            c_sample_03_result_details
            c_sample_04_multi_stream
            c_sample_05_cloud
            c_sample_07_multistage_anpr
            PROPERTIES
            INSTALL_RPATH "/usr/lib/carmen_video_sdk"
            BUILD_RPATH "/usr/lib/carmen_video_sdk"
    )
endif()