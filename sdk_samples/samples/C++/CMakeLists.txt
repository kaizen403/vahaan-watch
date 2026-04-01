cmake_minimum_required(VERSION 3.16)
project(cmv_cpp_samples)

if(WIN32)
    include_directories($ENV{CMV_INSTALL_DIR}/sdk/C/include)
    include_directories($ENV{CMV_INSTALL_DIR}/sdk/C++/include)
    link_directories($ENV{CMV_INSTALL_DIR}/sdk/C/lib)
endif()

if(UNIX)
    include_directories(/usr/include/carmen_video_sdk/c)
    include_directories(/usr/include/carmen_video_sdk/cpp)
    link_directories(/usr/lib/carmen_video_sdk)
endif()

include_directories(common)

add_subdirectory(01_minimal)
add_subdirectory(02_basic)
add_subdirectory(03_result_details)
add_subdirectory(04_multi_stream)
add_subdirectory(05_cloud)
if(CMV_ENABLE_EXPERIMENTAL_FEATURES)
    add_subdirectory(06_custom_stream) # custom stream: experimental feature
endif()
add_subdirectory(07_multistage_anpr)
add_subdirectory(test_debug)

if(UNIX)
    set_target_properties(
            cpp_sample_01_minimal
            cpp_sample_02_basic
            cpp_sample_03_result_details
            cpp_sample_04_multi_stream
            cpp_sample_05_cloud
            cpp_sample_07_multistage_anpr
            cpp_test_debug
            PROPERTIES
            INSTALL_RPATH "/usr/lib/carmen_video_sdk"
            BUILD_RPATH "/usr/lib/carmen_video_sdk"
    )

    if(CMV_ENABLE_EXPERIMENTAL_FEATURES)
        set_target_properties(
                cpp_sample_06_custom_stream
                PROPERTIES
                INSTALL_RPATH "/usr/lib/carmen_video_sdk"
                BUILD_RPATH "/usr/lib/carmen_video_sdk"
        )
    endif()

endif()